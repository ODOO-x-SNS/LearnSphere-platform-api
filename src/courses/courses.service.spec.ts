import { Test, TestingModule } from '@nestjs/testing';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

const mockPrisma: any = {
  course: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  auditLog: { create: jest.fn() },
};

const mockAuditLog = {
  create: jest.fn(),
};

describe('CoursesService', () => {
  let service: CoursesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should throw NotFoundException if course not found', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a course and audit log', async () => {
      const user = { sub: 'user-1', email: 'instructor@test.com', role: 'INSTRUCTOR' };
      mockPrisma.course.create.mockResolvedValue({
        id: 'c1',
        title: 'Test Course',
        slug: 'test-course',
      });

      const result = await service.create(
        { title: 'Test Course' },
        user,
      );

      expect(result.title).toBe('Test Course');
      expect(mockAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COURSE_CREATED' }),
      );
    });
  });

  describe('publish', () => {
    it('should throw if websiteUrl is missing', async () => {
      const user = { sub: 'user-1', email: 'i@test.com', role: 'ADMIN' };
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        responsibleId: 'user-1',
        websiteUrl: null,
        lessons: [],
      });

      await expect(service.publish('c1', user)).rejects.toThrow(BadRequestException);
    });
  });
});
