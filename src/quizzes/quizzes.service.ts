import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BadgesService } from '../badges/badges.service';
import { CreateQuizDto, SubmitAttemptDto } from './dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly badges: BadgesService,
  ) {}

  /* ─── Create Quiz ─── */
  async create(courseId: string, dto: CreateQuizDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== Role.ADMIN && course.responsibleId !== user.sub) {
      throw new ForbiddenException('Not allowed');
    }

    const quiz = await this.prisma.quiz.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        lessonId: dto.lessonId,
        pointsFirstTry: dto.pointsFirstTry ?? 0,
        pointsSecondTry: dto.pointsSecondTry ?? 0,
        pointsThirdTry: dto.pointsThirdTry ?? 0,
        pointsFourthPlus: dto.pointsFourthPlus ?? 0,
        allowMultipleAttempts: dto.allowMultipleAttempts ?? true,
        questions: {
          create: dto.questions.map((q) => ({
            text: q.text,
            multipleSelection: q.multipleSelection ?? false,
            options: {
              create: q.options.map((o) => ({
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          })),
        },
      },
      include: { questions: { include: { options: true } } },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'QUIZ_CREATED',
      resourceType: 'Quiz',
      resourceId: quiz.id,
      courseId,
      data: { title: quiz.title },
    });

    return quiz;
  }

  /* ─── Get Quiz ─── */
  async findById(id: string, user?: JwtPayload) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            options: {
              select: {
                id: true,
                questionId: true,
                text: true,
                createdAt: true,
                // isCorrect only for instructors/admins — handled below
                isCorrect: true,
              },
            },
          },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    // SECURITY: strip isCorrect for learners
    if (!user || user.role === Role.LEARNER) {
      return {
        ...quiz,
        questions: quiz.questions.map((q) => ({
          ...q,
          options: q.options.map(({ isCorrect, ...rest }) => rest),
        })),
      };
    }
    return quiz;
  }

  /* ─── Submit Attempt (Critical flow) ─── */
  async submitAttempt(quizId: string, dto: SubmitAttemptDto, user: JwtPayload) {
    const result = await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.findUnique({
        where: { id: quizId },
        include: {
          questions: { include: { options: true } },
        },
      });
      if (!quiz) throw new NotFoundException('Quiz not found');

      // Enrollment check — learner must be enrolled
      if (user.role === Role.LEARNER) {
        const enrollment = await tx.enrollment.findUnique({
          where: {
            unique_enrollment_per_user_course: {
              courseId: quiz.courseId,
              userId: user.sub,
            },
          },
        });
        if (!enrollment) {
          throw new ForbiddenException('You must be enrolled in this course to attempt the quiz');
        }
      }

      // Count previous attempts
      const prevCount = await tx.quizAttempt.count({
        where: { quizId, userId: user.sub },
      });

      if (!quiz.allowMultipleAttempts && prevCount > 0) {
        throw new BadRequestException('Multiple attempts not allowed for this quiz');
      }

      const attemptNumber = prevCount + 1;

      // Score the answers server-side
      let score = 0;
      let maxScore = 0;

      for (const question of quiz.questions) {
        maxScore += 1;
        const answer = dto.answers.find((a) => a.questionId === question.id);
        if (!answer) continue;

        const correctOptionIds = question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id)
          .sort();
        const selectedIds = [...answer.selectedOptionIds].sort();

        // Exact match
        if (
          correctOptionIds.length === selectedIds.length &&
          correctOptionIds.every((cid, i) => cid === selectedIds[i])
        ) {
          score += 1;
        }
      }

      // Determine points based on attempt number
      let awardedPoints = 0;
      switch (attemptNumber) {
        case 1:
          awardedPoints = quiz.pointsFirstTry;
          break;
        case 2:
          awardedPoints = quiz.pointsSecondTry;
          break;
        case 3:
          awardedPoints = quiz.pointsThirdTry;
          break;
        default:
          awardedPoints = quiz.pointsFourthPlus;
          break;
      }

      // Create QuizAttempt
      const attempt = await tx.quizAttempt.create({
        data: {
          quizId,
          userId: user.sub,
          attemptNumber,
          answers: dto.answers as any,
          score,
          maxScore,
        },
      });

      // Create PointsTransaction & update totalPoints
      if (awardedPoints > 0) {
        await tx.pointsTransaction.create({
          data: {
            userId: user.sub,
            source: 'QUIZ',
            points: awardedPoints,
            metadata: {
              quizAttemptId: attempt.id,
              quizId,
              courseId: quiz.courseId,
              attemptNumber,
            },
          },
        });

        await tx.user.update({
          where: { id: user.sub },
          data: { totalPoints: { increment: awardedPoints } },
        });
      }

      return {
        attempt: {
          id: attempt.id,
          attemptNumber,
          score,
          maxScore,
        },
        awardedPoints,
      };
    });

    // Check & award badges after transaction (non-blocking)
    try {
      const badgeResult = await this.badges.checkAndAwardBadges(user.sub);
      if (badgeResult && !Array.isArray(badgeResult) && badgeResult.badges.length > 0) {
        return { ...result, newBadges: badgeResult.badges };
      }
    } catch (err) {
      this.logger.warn(`Badge check failed for user ${user.sub}: ${err}`);
    }

    return { ...result, newBadges: [] as string[] };
  }

  /* ─── Get User Attempts for a Quiz ─── */
  async getAttempts(quizId: string, user: JwtPayload) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, userId: user.sub },
      orderBy: { attemptNumber: 'asc' },
    });

    return {
      quizId,
      totalAttempts: attempts.length,
      attempts: attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        score: a.score,
        maxScore: a.maxScore,
        createdAt: a.createdAt,
      })),
    };
  }

  /* ─── Update Quiz ─── */
  async update(id: string, dto: CreateQuizDto, user: JwtPayload) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (user.role !== Role.ADMIN && quiz.course.responsibleId !== user.sub) {
      throw new ForbiddenException('Not allowed');
    }

    // Delete old questions & options, then recreate
    await this.prisma.question.deleteMany({ where: { quizId: id } });

    const updated = await this.prisma.quiz.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        pointsFirstTry: dto.pointsFirstTry ?? quiz.pointsFirstTry,
        pointsSecondTry: dto.pointsSecondTry ?? quiz.pointsSecondTry,
        pointsThirdTry: dto.pointsThirdTry ?? quiz.pointsThirdTry,
        pointsFourthPlus: dto.pointsFourthPlus ?? quiz.pointsFourthPlus,
        allowMultipleAttempts: dto.allowMultipleAttempts ?? quiz.allowMultipleAttempts,
        questions: {
          create: dto.questions.map((q) => ({
            text: q.text,
            multipleSelection: q.multipleSelection ?? false,
            options: {
              create: q.options.map((o) => ({
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          })),
        },
      },
      include: { questions: { include: { options: true } } },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'QUIZ_UPDATED',
      resourceType: 'Quiz',
      resourceId: id,
      courseId: quiz.courseId,
      data: { title: updated.title },
    });

    return updated;
  }

  /* ─── Delete Quiz ─── */
  async delete(id: string, user: JwtPayload) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (user.role !== Role.ADMIN && quiz.course.responsibleId !== user.sub) {
      throw new ForbiddenException('Not allowed');
    }

    await this.prisma.quiz.delete({ where: { id } });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'QUIZ_DELETED',
      resourceType: 'Quiz',
      resourceId: id,
      courseId: quiz.courseId,
      data: { title: quiz.title },
    });

    return { message: 'Quiz deleted' };
  }
}
