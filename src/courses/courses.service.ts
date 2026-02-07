import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateCourseDto, UpdateCourseDto, QueryCoursesDto } from './dto';
import { slugify, buildPaginatedResponse, decodeCursor } from '../common/utils/helpers';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /* ─── List ─── */
  async findAll(query: QueryCoursesDto) {
    const { search, cursor, limit = 20, visibility } = query;
    const take = Math.min(limit, 100) + 1; // fetch one extra for cursor

    const where: Prisma.CourseWhereInput = {
      published: true,
      ...(visibility ? { visibility } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { tags: { has: search } },
            ],
          }
        : {}),
    };

    const cursorObj = cursor ? decodeCursor(cursor) : undefined;

    const courses = await this.prisma.course.findMany({
      where,
      take,
      ...(cursorObj ? { cursor: { id: cursorObj.id }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        tags: true,
        coverImageId: true,
        totalDurationSec: true,
        lessonsCount: true,
        published: true,
        visibility: true,
        accessRule: true,
        price: true,
        responsibleId: true,
        createdAt: true,
      },
    });

    return buildPaginatedResponse(courses, limit);
  }

  /* ─── Get by ID ─── */
  async findById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        lessons: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
        quizzes: { include: { questions: { include: { options: true } } } },
        responsible: { select: { id: true, name: true, email: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  /* ─── Create ─── */
  async create(dto: CreateCourseDto, user: JwtPayload) {
    const slug = slugify(dto.title) + '-' + Date.now().toString(36);

    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        tags: dto.tags ?? [],
        responsibleId: user.sub,
      },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'COURSE_CREATED',
      resourceType: 'Course',
      resourceId: course.id,
      courseId: course.id,
      data: { title: course.title },
    });

    return course;
  }

  /* ─── Update ─── */
  async update(id: string, dto: UpdateCourseDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title, slug: slugify(dto.title) + '-' + Date.now().toString(36) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.tags ? { tags: dto.tags } : {}),
        ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl } : {}),
        ...(dto.coverImageId !== undefined ? { coverImageId: dto.coverImageId } : {}),
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
        ...(dto.accessRule ? { accessRule: dto.accessRule } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
      },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'COURSE_UPDATED',
      resourceType: 'Course',
      resourceId: id,
      courseId: id,
      data: dto,
    });

    return updated;
  }

  /* ─── Publish ─── */
  async publish(id: string, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { lessons: { where: { deletedAt: null } } },
    });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    // Validation: websiteUrl required for publish
    if (!course.websiteUrl) {
      throw new BadRequestException('Course websiteUrl is required before publishing');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.course.update({
        where: { id },
        data: { published: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'COURSE_PUBLISHED',
          resourceType: 'Course',
          resourceId: id,
          courseId: id,
          data: { title: course.title },
        },
      });

      return result;
    });

    return updated;
  }

  /* ─── Unpublish ─── */
  async unpublish(id: string, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    const updated = await this.prisma.course.update({
      where: { id },
      data: { published: false },
    });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'COURSE_UNPUBLISHED',
      resourceType: 'Course',
      resourceId: id,
      courseId: id,
    });

    return updated;
  }

  /* ─── Delete (soft) ─── */
  async delete(id: string, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    this.assertCanEdit(user, course);

    await this.prisma.course.delete({ where: { id } });

    await this.auditLog.create({
      actorId: user.sub,
      action: 'COURSE_DELETED',
      resourceType: 'Course',
      resourceId: id,
      data: { title: course.title },
    });

    return { message: 'Course deleted' };
  }

  /* ─── Helpers ─── */
  private assertCanEdit(user: JwtPayload, course: { responsibleId: string | null }) {
    if (user.role === Role.ADMIN) return;
    if (course.responsibleId === user.sub) return;
    throw new ForbiddenException('You do not have permission to edit this course');
  }
}
