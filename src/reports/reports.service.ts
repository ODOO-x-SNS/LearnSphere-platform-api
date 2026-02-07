import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Course progress report */
  async courseProgress(courseId: string, filterStatus?: string, cursor?: string, limit = 50) {
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

  /** Dashboard stats for admin */
  async dashboardStats() {
    const [totalUsers, totalCourses, totalEnrollments, totalQuizAttempts] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.course.count({ where: { published: true } }),
        this.prisma.enrollment.count(),
        this.prisma.quizAttempt.count(),
      ]);

    return { totalUsers, totalCourses, totalEnrollments, totalQuizAttempts };
  }
}
