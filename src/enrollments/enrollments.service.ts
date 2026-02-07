import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Enroll user in course — enforces access rules */
  async enroll(courseId: string, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (!course.published) throw new BadRequestException('Course is not published');

    // Check existing enrollment
    const existing = await this.prisma.enrollment.findUnique({
      where: { unique_enrollment_per_user_course: { courseId, userId: user.sub } },
    });
    if (existing) throw new ConflictException('Already enrolled');

    // Enforce access rule
    switch (course.accessRule) {
      case 'INVITATION': {
        // Must have accepted invitation
        const invitation = await this.prisma.invitation.findFirst({
          where: { courseId, email: user.email, status: 'ACCEPTED' },
        });
        if (!invitation) {
          throw new ForbiddenException('Invitation required for this course');
        }
        break;
      }
      case 'PAYMENT': {
        // TODO: Integrate Stripe checkout. For now, throw.
        throw new BadRequestException(
          'This course requires payment. Use POST /api/v1/courses/:id/checkout',
        );
      }
      case 'OPEN':
      default:
        break;
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        courseId,
        userId: user.sub,
        isInvited: course.accessRule === 'INVITATION',
      },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'ENROLLMENT_CREATED',
      resourceType: 'Enrollment',
      resourceId: enrollment.id,
      courseId,
    });

    return enrollment;
  }

  /** Get enrollments for current user */
  async findMyEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: { id: true, title: true, slug: true, coverImageId: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  /** Update progress (partial) */
  async updateProgress(
    enrollmentId: string,
    progress: any,
    completionPercent: number,
    userId: string,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.userId !== userId) throw new ForbiddenException();

    const status =
      completionPercent >= 100
        ? 'COMPLETED'
        : completionPercent > 0
          ? 'IN_PROGRESS'
          : 'YET_TO_START';

    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progress,
        completionPercent,
        status: status as any,
        ...(status === 'IN_PROGRESS' && !enrollment.startDate ? { startDate: new Date() } : {}),
        ...(status === 'COMPLETED' ? { completedDate: new Date() } : {}),
      },
    });
  }
}
