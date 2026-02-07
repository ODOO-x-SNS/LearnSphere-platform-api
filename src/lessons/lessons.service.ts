import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateLessonDto, UpdateLessonDto } from './dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(courseId: string, dto: CreateLessonDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    // Always compute a safe sortOrder as MAX(sortOrder)+1 to avoid
    // unique-constraint collisions with soft-deleted lessons.
    const maxResult = await this.prisma.lesson.aggregate({
      where: { courseId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxResult._max.sortOrder ?? -1) + 1;

    const lesson = await this.prisma.$transaction(async (tx) => {
      const l = await tx.lesson.create({
        data: {
          courseId,
          title: dto.title,
          type: dto.type,
          externalUrl: dto.externalUrl,
          durationSec: dto.durationSec,
          allowDownload: dto.allowDownload ?? false,
          description: dto.description,
          sortOrder,
          mediaFileId: dto.mediaFileId,
        },
      });

      // Update course counters
      await tx.course.update({
        where: { id: courseId },
        data: {
          lessonsCount: { increment: 1 },
          ...(dto.durationSec ? { totalDurationSec: { increment: dto.durationSec } } : {}),
        },
      });

      return l;
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'LESSON_CREATED',
      resourceType: 'Lesson',
      resourceId: lesson.id,
      courseId,
      lessonId: lesson.id,
      data: { title: lesson.title },
    });

    return lesson;
  }

  async update(id: string, dto: UpdateLessonDto, user: JwtPayload) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson || lesson.deletedAt) throw new NotFoundException('Lesson not found');
    this.assertCanEdit(user, lesson.course);

    const durationDiff =
      dto.durationSec !== undefined ? (dto.durationSec - (lesson.durationSec ?? 0)) : 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const l = await tx.lesson.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.externalUrl !== undefined ? { externalUrl: dto.externalUrl } : {}),
          ...(dto.durationSec !== undefined ? { durationSec: dto.durationSec } : {}),
          ...(dto.allowDownload !== undefined ? { allowDownload: dto.allowDownload } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.mediaFileId !== undefined ? { mediaFileId: dto.mediaFileId } : {}),
        },
      });

      if (durationDiff !== 0) {
        await tx.course.update({
          where: { id: lesson.courseId },
          data: { totalDurationSec: { increment: durationDiff } },
        });
      }

      return l;
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'LESSON_UPDATED',
      resourceType: 'Lesson',
      resourceId: id,
      courseId: lesson.courseId,
      lessonId: id,
      data: dto,
    });

    return updated;
  }

  async delete(id: string, user: JwtPayload) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson || lesson.deletedAt) throw new NotFoundException('Lesson not found');
    this.assertCanEdit(user, lesson.course);

    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.course.update({
        where: { id: lesson.courseId },
        data: {
          lessonsCount: { decrement: 1 },
          totalDurationSec: { decrement: lesson.durationSec ?? 0 },
        },
      });
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'LESSON_DELETED',
      resourceType: 'Lesson',
      resourceId: id,
      courseId: lesson.courseId,
      lessonId: id,
    });

    return { message: 'Lesson deleted' };
  }

  private assertCanEdit(user: JwtPayload, course: { responsibleId: string | null }) {
    if (user.role === Role.ADMIN) return;
    if (course.responsibleId === user.sub) return;
    throw new ForbiddenException('You do not have permission to edit this course');
  }
}
