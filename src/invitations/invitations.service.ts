import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes, createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from './email.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  /** Send invitations to a list of emails */
  async invite(courseId: string, emails: string[], user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    if (user.role !== Role.ADMIN && course.responsibleId !== user.sub) {
      throw new ForbiddenException('Not allowed');
    }

    const invitations = [];
    for (const email of emails) {
      // If a pending invite already exists, resend the email instead of creating a duplicate
      const existing = await this.prisma.invitation.findFirst({
        where: { courseId, email, status: 'PENDING' },
      });
      if (existing) {
        await this.emailService.sendInvitationEmail(email, course.title, existing.token);
        invitations.push(existing);
        continue;
      }

      const token = this.generateSignedToken(courseId, email);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invite = await this.prisma.invitation.create({
        data: {
          courseId,
          email,
          invitedById: user.sub,
          token,
          expiresAt,
        },
      });
      invitations.push(invite);

      // Send invitation email
      await this.emailService.sendInvitationEmail(email, course.title, token);
    }

    await this.auditLog.create({
      actorId: user.sub,
      action: 'INVITATIONS_SENT',
      resourceType: 'Course',
      resourceId: courseId,
      courseId,
      data: { emails, count: emails.length },
    });

    return { sent: invitations.length, invitations };
  }

  /** Validate an invitation token (public, no auth required) */
  async validateToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { course: { select: { id: true, title: true, slug: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Invitation already used');
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation expired');
    }

    return {
      valid: true,
      courseId: invitation.courseId,
      courseTitle: invitation.course.title,
      email: invitation.email,
    };
  }

  /** Accept an invitation — mark as accepted + auto-enroll the user */
  async accept(token: string, user: JwtPayload) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { course: { select: { id: true, title: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Invitation already used');
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation expired');
    }

    // Mark invitation as accepted + auto-enroll in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      // Auto-enroll if not already enrolled
      const existing = await tx.enrollment.findUnique({
        where: {
          unique_enrollment_per_user_course: {
            courseId: invitation.courseId,
            userId: user.sub,
          },
        },
      });

      if (!existing) {
        await tx.enrollment.create({
          data: {
            courseId: invitation.courseId,
            userId: user.sub,
            isInvited: true,
          },
        });
      }

      return {
        message: 'Invitation accepted and enrolled in course',
        courseId: invitation.courseId,
        courseTitle: invitation.course.title,
      };
    });

    return result;
  }

  private generateSignedToken(courseId: string, email: string): string {
    const rand = randomBytes(32).toString('hex');
    const secret = this.config.get<string>('JWT_SECRET', 'secret');
    const hmac = createHmac('sha256', secret)
      .update(`${courseId}:${email}:${rand}`)
      .digest('hex')
      .slice(0, 16);
    return `${rand}${hmac}`;
  }
}
