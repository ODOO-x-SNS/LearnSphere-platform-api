import { Test, TestingModule } from '@nestjs/testing';
import { QuizzesService } from './quizzes.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockTx = {
  quiz: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  quizAttempt: {
    count: jest.fn(),
    create: jest.fn(),
  },
  pointsTransaction: {
    create: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
};

const mockPrisma = {
  quiz: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  course: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockTx)),
  auditLog: { create: jest.fn() },
};

const mockAuditLog = { create: jest.fn() };

describe('QuizzesService', () => {
  let service: QuizzesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<QuizzesService>(QuizzesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitAttempt', () => {
    it('should throw NotFoundException if quiz not found', async () => {
      mockTx.quiz.findUnique.mockResolvedValue(null);
      const user = { sub: 'u1', email: 'a@b.com', role: 'LEARNER' };

      await expect(
        service.submitAttempt('non-existent', { answers: [] }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('should score answers and create attempt + points transaction', async () => {
      const quiz = {
        id: 'q1',
        courseId: 'c1',
        allowMultipleAttempts: true,
        pointsFirstTry: 100,
        pointsSecondTry: 75,
        pointsThirdTry: 50,
        pointsFourthPlus: 25,
        questions: [
          {
            id: 'question-1',
            options: [
              { id: 'opt-a', isCorrect: false },
              { id: 'opt-b', isCorrect: true },
            ],
          },
        ],
      };

      mockTx.quiz.findUnique.mockResolvedValue(quiz);
      mockTx.quizAttempt.count.mockResolvedValue(0); // first attempt
      mockTx.quizAttempt.create.mockResolvedValue({
        id: 'attempt-1',
        attemptNumber: 1,
        score: 1,
        maxScore: 1,
      });
      mockTx.pointsTransaction.create.mockResolvedValue({});
      mockTx.user.update.mockResolvedValue({});

      const user = { sub: 'u1', email: 'a@b.com', role: 'LEARNER' };
      const result = await service.submitAttempt(
        'q1',
        {
          answers: [{ questionId: 'question-1', selectedOptionIds: ['opt-b'] }],
        },
        user,
      );

      expect(result.awardedPoints).toBe(100);
      expect(result.attempt.score).toBe(1);
      expect(result.attempt.maxScore).toBe(1);
      expect(mockTx.pointsTransaction.create).toHaveBeenCalled();
    });

    it('should reject if multiple attempts not allowed', async () => {
      const quiz = {
        id: 'q1',
        courseId: 'c1',
        allowMultipleAttempts: false,
        pointsFirstTry: 100,
        pointsSecondTry: 0,
        pointsThirdTry: 0,
        pointsFourthPlus: 0,
        questions: [],
      };

      mockTx.quiz.findUnique.mockResolvedValue(quiz);
      mockTx.quizAttempt.count.mockResolvedValue(1); // already attempted

      const user = { sub: 'u1', email: 'a@b.com', role: 'LEARNER' };
      await expect(
        service.submitAttempt('q1', { answers: [] }, user),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('should strip isCorrect for learner', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 'q1',
        questions: [
          {
            id: 'question-1',
            text: 'Test?',
            options: [
              { id: 'opt-a', questionId: 'question-1', text: 'A', isCorrect: true, createdAt: new Date() },
              { id: 'opt-b', questionId: 'question-1', text: 'B', isCorrect: false, createdAt: new Date() },
            ],
          },
        ],
      });

      const learner = { sub: 'u1', email: 'a@b.com', role: 'LEARNER' };
      const result = await service.findById('q1', learner);

      // isCorrect should be stripped
      for (const q of result.questions) {
        for (const opt of q.options) {
          expect(opt).not.toHaveProperty('isCorrect');
        }
      }
    });
  });
});
