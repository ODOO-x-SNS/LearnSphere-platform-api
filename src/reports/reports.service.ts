import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Course progress report — scoped by role */
  async courseProgress(
    courseId: string,
    user: JwtPayload,
    filterStatus?: string,
    cursor?: string,
    limit = 50,
  ) {
    // Instructor can only view reports for their own courses
    if (user.role !== Role.ADMIN) {
      const course = await this.prisma.course.findUnique({ where: { id: courseId } });
      if (!course || course.responsibleId !== user.sub) {
        throw new ForbiddenException('You can only view reports for your own courses');
      }
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        ...(filterStatus ? { status: filterStatus as any } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const hasMore = enrollments.length > limit;
    const rows = hasMore ? enrollments.slice(0, limit) : enrollments;
    const nextCursor = hasMore ? rows[rows.length - 1].id : null;

    // Summary
    const total = await this.prisma.enrollment.count({ where: { courseId } });
    const completed = await this.prisma.enrollment.count({
      where: { courseId, status: 'COMPLETED' },
    });
    const inProgress = await this.prisma.enrollment.count({
      where: { courseId, status: 'IN_PROGRESS' },
    });

    return {
      summary: {
        total,
        completed,
        inProgress,
        completionRate: total > 0 ? completed / total : 0,
      },
      rows,
      paging: { nextCursor, limit },
    };
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
