import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Role, LessonType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BadgesService } from '../badges/badges.service';
import { CreateLessonDto, UpdateLessonDto, ReorderLessonsDto } from './dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly badges: BadgesService,
  ) {}

  /* ─── Create Lesson ─── */
  async create(courseId: string, dto: CreateLessonDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    // Validate quiz lesson
    if (dto.type === LessonType.QUIZ) {
      if (!dto.quizId) {
        throw new BadRequestException('quizId is required when lesson type is QUIZ');
      }
      const quiz = await this.prisma.quiz.findUnique({ where: { id: dto.quizId } });
      if (!quiz) throw new NotFoundException('Quiz not found');
      if (quiz.courseId !== courseId) {
        throw new BadRequestException('Quiz must belong to the same course');
      }
      // Check quiz not already linked to another lesson via quizId field
      // Must check ALL lessons (including soft-deleted) because the @unique
      // constraint on quizId applies regardless of deletedAt
      const existingLink = await this.prisma.lesson.findFirst({
        where: { quizId: dto.quizId },
      });
      if (existingLink) {
        throw new BadRequestException('This quiz is already linked to another lesson');
      }
    }

    // Always compute a safe sortOrder as MAX(sortOrder)+1
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
          quizId: dto.type === LessonType.QUIZ ? dto.quizId : null,
        },
      });

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

  /* ─── List Lessons for a Course ─── */
  async findByCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    return this.prisma.lesson.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        linkedQuiz: {
          select: {
            id: true,
            title: true,
            pointsFirstTry: true,
            pointsSecondTry: true,
            pointsThirdTry: true,
            pointsFourthPlus: true,
          },
        },
      },
    });
  }

  /* ─── Reorder Lessons ─── */
  async reorder(courseId: string, dto: ReorderLessonsDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    await this.prisma.$transaction(async (tx) => {
      // First pass: set all to temp negative values to avoid unique constraint conflicts
      for (let i = 0; i < dto.lessons.length; i++) {
        await tx.lesson.update({
          where: { id: dto.lessons[i].id },
          data: { sortOrder: -(i + 1000) },
        });
      }
      // Second pass: set correct values
      for (const item of dto.lessons) {
        await tx.lesson.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'LESSONS_REORDERED',
      resourceType: 'Course',
      resourceId: courseId,
      courseId,
      data: { order: dto.lessons },
    });

    return { message: 'Lessons reordered' };
  }

  /* ─── Complete Lesson ─── */
  async completeLesson(lessonId: string, user: JwtPayload) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, linkedQuiz: true },
    });
    if (!lesson || lesson.deletedAt) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        unique_enrollment_per_user_course: {
          courseId: lesson.courseId,
          userId: user.sub,
        },
      },
    });
    if (!enrollment) throw new ForbiddenException('You must be enrolled in this course');

    // Sequential check
    if (lesson.course.sequentialProgress) {
      const allLessons = await this.prisma.lesson.findMany({
        where: { courseId: lesson.courseId, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      });
      const completedLessons = await this.prisma.lessonProgress.findMany({
        where: { enrollmentId: enrollment.id },
        select: { lessonId: true },
      });
      const completedIds = new Set(completedLessons.map((lp) => lp.lessonId));
      const nextLesson = allLessons.find((l) => !completedIds.has(l.id));
      if (nextLesson && nextLesson.id !== lessonId) {
        throw new ForbiddenException('Complete previous lessons first');
      }
    }

    // If quiz lesson, verify attempt exists
    if (lesson.type === LessonType.QUIZ && lesson.quizId) {
      const attemptCount = await this.prisma.quizAttempt.count({
        where: { quizId: lesson.quizId, userId: user.sub },
      });
      if (attemptCount === 0) {
        throw new BadRequestException(
          'You must complete the quiz before marking this lesson as complete',
        );
      }
    }

    // Idempotent write
    const existing = await this.prisma.lessonProgress.findUnique({
      where: {
        unique_lesson_progress_per_enrollment: {
          enrollmentId: enrollment.id,
          lessonId,
        },
      },
    });
    if (!existing) {
      await this.prisma.lessonProgress.create({
        data: {
          enrollmentId: enrollment.id,
          lessonId,
          courseId: lesson.courseId,
          userId: user.sub,
        },
      });
    }

    // Recalculate progress
    const totalLessons = await this.prisma.lesson.count({
      where: { courseId: lesson.courseId, deletedAt: null },
    });
    const completedCount = await this.prisma.lessonProgress.count({
      where: { enrollmentId: enrollment.id },
    });
    const completionPercent = Math.min(Math.round((completedCount / totalLessons) * 100), 100);
    const allCompleted = completedCount >= totalLessons;

    // Get all completed lesson IDs
    const allCompletedLessons = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { lessonId: true },
    });

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        completionPercent,
        status: allCompleted ? 'COMPLETED' : completionPercent > 0 ? 'IN_PROGRESS' : 'YET_TO_START',
        ...(completionPercent > 0 && !enrollment.startDate ? { startDate: new Date() } : {}),
        ...(allCompleted ? { completedDate: new Date() } : {}),
        progress: { completedLessonIds: allCompletedLessons.map((lp) => lp.lessonId) },
      },
    });

    // Course completion bonus
    let newBadges: string[] = [];
    if (allCompleted) {
      const existingCompletionPoints = await this.prisma.pointsTransaction.findFirst({
        where: {
          userId: user.sub,
          source: 'COURSE_COMPLETION',
          metadata: { path: ['courseId'], equals: lesson.courseId },
        },
      });
      if (!existingCompletionPoints) {
        const COMPLETION_POINTS = 50;
        await this.prisma.$transaction(async (tx) => {
          await tx.pointsTransaction.create({
            data: {
              userId: user.sub,
              source: 'COURSE_COMPLETION',
              points: COMPLETION_POINTS,
              metadata: { courseId: lesson.courseId },
            },
          });
          await tx.user.update({
            where: { id: user.sub },
            data: { totalPoints: { increment: COMPLETION_POINTS } },
          });
        });
      }

      try {
        const badgeResult = await this.badges.checkAndAwardBadges(user.sub);
        if (badgeResult && !Array.isArray(badgeResult) && badgeResult.badges.length > 0) {
          newBadges = badgeResult.badges;
        }
      } catch (err) {
        this.logger.warn(`Badge check failed for user ${user.sub}: ${err}`);
      }
    }

    // Determine next lesson
    let nextLessonId: string | null = null;
    if (!allCompleted) {
      const allLessons = await this.prisma.lesson.findMany({
        where: { courseId: lesson.courseId, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      });
      const completedIds = new Set(allCompletedLessons.map((lp) => lp.lessonId));
      const next = allLessons.find((l) => !completedIds.has(l.id));
      if (next) nextLessonId = next.id;
    }

    return {
      lessonId,
      completed: true,
      completionPercent,
      courseCompleted: allCompleted,
      nextLessonId,
      newBadges,
    };
  }

  /* ─── Get Enrollment Progress ─── */
  async getProgress(courseId: string, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        unique_enrollment_per_user_course: { courseId, userId: user.sub },
      },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled');

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, type: true, sortOrder: true, quizId: true },
    });

    const completedProgress = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { lessonId: true, completedAt: true },
    });
    const completedMap = new Map(completedProgress.map((lp) => [lp.lessonId, lp.completedAt]));

    const lessonStates = lessons.map((lesson, idx) => {
      const isCompleted = completedMap.has(lesson.id);
      let state: 'completed' | 'unlocked' | 'locked' = 'locked';

      if (isCompleted) {
        state = 'completed';
      } else if (!course.sequentialProgress) {
        state = 'unlocked';
      } else {
        if (idx === 0) {
          state = 'unlocked';
        } else {
          const allPreviousCompleted = lessons.slice(0, idx).every((l) => completedMap.has(l.id));
          state = allPreviousCompleted ? 'unlocked' : 'locked';
        }
      }

      return {
        lessonId: lesson.id,
        title: lesson.title,
        type: lesson.type,
        sortOrder: lesson.sortOrder,
        quizId: lesson.quizId,
        state,
        completedAt: completedMap.get(lesson.id) || null,
      };
    });

    return {
      courseId,
      enrollmentId: enrollment.id,
      sequentialProgress: course.sequentialProgress,
      completionPercent: enrollment.completionPercent,
      status: enrollment.status,
      courseCompleted: enrollment.status === 'COMPLETED',
      lessons: lessonStates,
    };
  }

  /* ─── Update ─── */
  async update(id: string, dto: UpdateLessonDto, user: JwtPayload) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson || lesson.deletedAt) throw new NotFoundException('Lesson not found');
    this.assertCanEdit(user, lesson.course);

    const newType = dto.type || lesson.type;
    let quizId = dto.quizId !== undefined ? dto.quizId : lesson.quizId;
    if (newType === LessonType.QUIZ && dto.quizId) {
      const quiz = await this.prisma.quiz.findUnique({ where: { id: dto.quizId } });
      if (!quiz) throw new NotFoundException('Quiz not found');
      if (quiz.courseId !== lesson.courseId) {
        throw new BadRequestException('Quiz must belong to the same course');
      }
    }
    if (newType !== LessonType.QUIZ) {
      quizId = null;
    }

    const durationDiff =
      dto.durationSec !== undefined ? dto.durationSec - (lesson.durationSec ?? 0) : 0;

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
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          quizId,
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

  /* ─── Delete (soft) ─── */
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
        data: { deletedAt: new Date(), quizId: null },
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
