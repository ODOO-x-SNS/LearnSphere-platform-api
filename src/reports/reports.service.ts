import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Course progress report — works with or without courseId
   * Returns summary stats + per-enrollment rows with progress details
   */
  async courseProgress(
    user: JwtPayload,
    courseId?: string,
    filterStatus?: string,
    search?: string,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const enrollmentWhere: Record<string, unknown> = {};

    if (courseId) {
      enrollmentWhere.courseId = courseId;
    } else if (!isAdmin) {
      enrollmentWhere.course = { responsibleId: user.sub };
    }

    if (filterStatus) {
      enrollmentWhere.status = filterStatus;
    }

    // Fetch enrollments with user + course + progress
    const enrollments = await this.prisma.enrollment.findMany({
      where: enrollmentWhere,
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, totalPoints: true, createdAt: true } },
        course: { select: { id: true, title: true, lessonsCount: true } },
        lessonProgress: { select: { id: true } },
      },
    });

    // Filter by search term
    let filtered = enrollments;
    if (search) {
      const q = search.toLowerCase();
      filtered = enrollments.filter(
        (e) =>
          (e.user.name || '').toLowerCase().includes(q) ||
          e.user.email.toLowerCase().includes(q),
      );
    }

    // Build rows
    const rows = filtered.map((e) => {
      const totalLessons = e.course.lessonsCount || 0;
      const completedLessons = e.lessonProgress.length;
      const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
      const status = e.status === 'COMPLETED'
        ? 'COMPLETED'
        : completedLessons > 0 || e.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : 'NOT_STARTED';

      return {
        enrollmentId: e.id,
        userId: e.user.id,
        userName: e.user.name || 'Unknown',
        email: e.user.email,
        avatarUrl: e.user.avatarUrl,
        courseId: e.course.id,
        courseTitle: e.course.title,
        progress: Math.round(progress * 100) / 100,
        completedLessons,
        totalLessons,
        status,
        enrolledAt: e.enrolledAt.toISOString(),
        completedDate: e.completedDate?.toISOString() || null,
        lastActivity: (e.completedDate || e.enrolledAt).toISOString(),
      };
    });

    // Compute quiz scores per user
    const userIds = [...new Set(filtered.map((e) => e.user.id))];
    const quizScores = userIds.length > 0
      ? await this.prisma.quizAttempt.groupBy({
          by: ['userId'],
          _avg: { score: true },
          _max: { score: true },
          where: { userId: { in: userIds } },
        })
      : [];

    const quizMap = new Map(quizScores.map((q) => [q.userId, q._avg.score ?? 0]));

    const rowsWithQuiz = rows.map((row) => ({
      ...row,
      quizScore: quizMap.get(row.userId) ?? null,
    }));

    // Summary
    const totalEnrolled = rows.length;
    const completed = rows.filter((r) => r.status === 'COMPLETED').length;
    const avgProgress = totalEnrolled > 0
      ? rows.reduce((sum, r) => sum + r.progress, 0) / totalEnrolled
      : 0;
    const allQuizScores = quizScores.map((q) => q._avg.score ?? 0);
    const avgQuizScore = allQuizScores.length > 0
      ? allQuizScores.reduce((a, b) => a + b, 0) / allQuizScores.length
      : 0;

    return {
      summary: {
        totalEnrolled,
        completionRate: totalEnrolled > 0 ? (completed / totalEnrolled) * 100 : 0,
        avgProgress,
        avgQuizScore,
      },
      rows: rowsWithQuiz,
    };
  }

  /** All learners list with details */
  async allLearners(user: JwtPayload, search?: string) {
    if (user.role !== Role.ADMIN) {
      // Instructors see only learners enrolled in their courses
      const learners = await this.prisma.enrollment.findMany({
        where: { course: { responsibleId: user.sub } },
        select: { userId: true },
        distinct: ['userId'],
      });
      const ids = learners.map((l) => l.userId);
      return this.fetchLearners(ids, search);
    }

    return this.fetchLearners(undefined, search);
  }

  private async fetchLearners(userIds?: string[], search?: string) {
    const where: Record<string, unknown> = { role: Role.LEARNER, deletedAt: null };
    if (userIds) {
      where.id = { in: userIds };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        totalPoints: true,
        status: true,
        createdAt: true,
        enrollments: {
          select: {
            id: true,
            courseId: true,
            status: true,
            completionPercent: true,
            enrolledAt: true,
            completedDate: true,
            course: { select: { id: true, title: true } },
            lessonProgress: { select: { id: true } },
          },
        },
        quizAttempts: {
          select: { score: true, maxScore: true },
        },
        badges: {
          select: { badge: { select: { name: true, iconUrl: true } }, earnedAt: true },
        },
        reviews: {
          select: { id: true, courseId: true, rating: true, text: true, createdAt: true, course: { select: { title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => {
      const totalCourses = u.enrollments.length;
      const completedCourses = u.enrollments.filter((e) => e.status === 'COMPLETED').length;
      const avgQuiz = u.quizAttempts.length > 0
        ? u.quizAttempts.reduce((sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0), 0) / u.quizAttempts.length
        : null;

      return {
        id: u.id,
        name: u.name || 'Unknown',
        email: u.email,
        avatarUrl: u.avatarUrl,
        totalPoints: u.totalPoints,
        status: u.status,
        joinedAt: u.createdAt.toISOString(),
        totalCourses,
        completedCourses,
        avgQuizScore: avgQuiz != null ? Math.round(avgQuiz) : null,
        badgeCount: u.badges.length,
        badges: u.badges.map((b) => ({ name: b.badge.name, icon: b.badge.iconUrl, earnedAt: b.earnedAt.toISOString() })),
        enrollments: u.enrollments.map((e) => ({
          courseId: e.courseId,
          courseTitle: e.course.title,
          status: e.status,
          lessonsCompleted: e.lessonProgress.length,
          enrolledAt: e.enrolledAt.toISOString(),
          completedDate: e.completedDate?.toISOString() || null,
        })),
        reviews: u.reviews.map((r) => ({
          id: r.id,
          courseId: r.courseId,
          courseTitle: r.course.title,
          rating: r.rating,
          text: r.text,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }

  /** All reviews across all courses */
  async allReviews(user: JwtPayload) {
    const where = user.role === Role.ADMIN ? {} : { course: { responsibleId: user.sub } };

    return this.prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Dashboard stats — scoped by role */
  async dashboardStats(user: JwtPayload) {
    const isAdmin = user.role === Role.ADMIN;
    const courseWhere = isAdmin ? {} : { responsibleId: user.sub };
    const enrollmentWhere = isAdmin ? {} : { course: { responsibleId: user.sub } };

    const [totalCourses, totalEnrolled, completedEnrollments] = await Promise.all([
      this.prisma.course.count({ where: courseWhere }),
      this.prisma.enrollment.count({ where: enrollmentWhere }),
      this.prisma.enrollment.count({ where: { ...enrollmentWhere, status: 'COMPLETED' } }),
    ]);

    const quizAgg = await this.prisma.quizAttempt.aggregate({
      _avg: { score: true },
      where: isAdmin ? {} : { quiz: { course: { responsibleId: user.sub } } },
    });

    const completionRate = totalEnrolled > 0 ? (completedEnrollments / totalEnrolled) * 100 : 0;

    return {
      totalCourses,
      totalEnrolled,
      completionRate,
      avgQuizScore: quizAgg._avg.score ?? 0,
    };
  }
}
