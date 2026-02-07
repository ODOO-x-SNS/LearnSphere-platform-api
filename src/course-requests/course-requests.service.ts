import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CourseRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitRequest(userId: string, data: { courseId: string }) {
    // Only instructors can submit course requests
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'INSTRUCTOR') {
      throw new ForbiddenException('Only instructors can submit course requests');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      select: {
        id: true,
        responsibleId: true,
        coverImageId: true,
        _count: { select: { lessons: true, quizzes: true } },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.responsibleId !== userId) {
      throw new ForbiddenException('You can only submit your own courses');
    }

    if (!course.coverImageId || course._count.lessons < 1 || course._count.quizzes < 1) {
      throw new BadRequestException(
        'Course must have a cover image, at least one lesson, and at least one quiz',
      );
    }

    const existingPending = await this.prisma.courseRequest.findFirst({
      where: { courseId: course.id, status: 'PENDING' },
      select: { id: true },
    });

    if (existingPending) {
      throw new BadRequestException('A pending request already exists for this course');
    }

    return this.prisma.courseRequest.create({
      data: {
        courseId: course.id,
        instructorId: userId,
      },
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            published: true,
            coverImage: { select: { id: true, url: true, filename: true } },
            _count: { select: { lessons: true, quizzes: true } },
          },
        },
      },
    });
  }

  async listRequests(skip: number = 0, take: number = 20, status?: string) {
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    const statusValue = status ? status.toUpperCase() : undefined;

    // Validate and construct where clause
    const isValidStatus = statusValue && validStatuses.includes(statusValue);
    const where: any = isValidStatus ? { status: statusValue } : {};

    // Get explicit course requests
    const [explicitRequests, explicitTotal] = await Promise.all([
      this.prisma.courseRequest.findMany({
        where,
        skip,
        take,
        include: {
          instructor: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              tags: true,
              published: true,
              coverImage: { select: { id: true, url: true, filename: true } },
              _count: { select: { lessons: true, quizzes: true } },
            },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.courseRequest.count({ where }),
    ]);

    // Filter by status - if APPROVED or REJECTED filter is applied, return only explicit requests
    if (isValidStatus && statusValue !== 'PENDING') {
      return {
        data: explicitRequests,
        paging: {
          total: explicitTotal,
          skip,
          take,
          hasMore: skip + take < explicitTotal,
        },
      };
    }

    // For PENDING filter or no filter, also include draft courses
    const draftCourses = await this.prisma.course.findMany({
      where: {
        published: false,
        responsible: { role: 'INSTRUCTOR' },
        // Exclude courses that already have pending or approved requests
        courseRequests: {
          none: {
            status: { in: ['PENDING', 'APPROVED'] },
          },
        },
      },
      include: {
        responsible: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        coverImage: { select: { id: true, url: true, filename: true } },
        _count: { select: { lessons: true, quizzes: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: Math.max(0, skip - explicitTotal),
      take: Math.max(0, take - explicitRequests.length),
    });

    // Transform drafts to look like pending course requests
    const transformedDrafts = draftCourses.map((course: any) => ({
      id: `draft_${course.id}`,
      courseId: course.id,
      status: 'PENDING',
      instructorId: course.responsibleId,
      instructor: course.responsible,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        tags: course.tags,
        published: false,
        coverImage: course.coverImage,
        _count: course._count,
      },
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }));

    const combinedData = [...explicitRequests, ...transformedDrafts];
    const totalCount =
      explicitTotal +
      (await this.prisma.course.count({
        where: {
          published: false,
          responsible: { role: 'INSTRUCTOR' },
          courseRequests: {
            none: {
              status: { in: ['PENDING', 'APPROVED'] },
            },
          },
        },
      }));

    return {
      data: combinedData,
      paging: {
        total: totalCount,
        skip,
        take,
        hasMore: skip + take < totalCount,
      },
    };
  }

  async getRequest(id: string) {
    // Handle draft course IDs (format: draft_courseId)
    if (id.startsWith('draft_')) {
      const courseId = id.replace('draft_', '');
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          responsible: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              bio: true,
            },
          },
          coverImage: { select: { id: true, url: true, filename: true } },
          _count: { select: { lessons: true, quizzes: true } },
        },
      });

      if (!course) {
        throw new NotFoundException('Draft course not found');
      }

      return {
        id,
        courseId: course.id,
        status: 'PENDING',
        instructorId: course.responsibleId,
        instructor: course.responsible,
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          tags: course.tags,
          published: false,
          coverImage: course.coverImage,
          _count: course._count,
        },
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      };
    }

    const request = await this.prisma.courseRequest.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            bio: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            tags: true,
            published: true,
            coverImage: { select: { id: true, url: true, filename: true } },
            _count: { select: { lessons: true, quizzes: true } },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Course request not found');
    }

    return request;
  }

  async approveRequest(id: string, adminId: string) {
    // Handle draft course IDs
    if (id.startsWith('draft_')) {
      const courseId = id.replace('draft_', '');
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        throw new NotFoundException('Draft course not found');
      }

      // Publish the draft course directly (no CourseRequest record)
      return this.prisma.course.update({
        where: { id: courseId },
        data: { published: true },
        include: {
          responsible: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }

    const request = await this.prisma.courseRequest.findUnique({
      where: { id },
      include: { course: { select: { id: true } } },
    });

    if (!request) {
      throw new NotFoundException('Course request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const [updatedRequest] = await this.prisma.$transaction([
      this.prisma.courseRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
        include: {
          instructor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              published: true,
            },
          },
        },
      }),
      this.prisma.course.update({
        where: { id: request.courseId },
        data: { published: true },
      }),
    ]);

    return updatedRequest;
  }

  async rejectRequest(id: string, adminId: string, reason: string) {
    // Draft courses cannot be rejected, they just remain as drafts
    if (id.startsWith('draft_')) {
      throw new BadRequestException(
        'Draft courses cannot be rejected. They remain as drafts for the instructor to edit.',
      );
    }

    const request = await this.prisma.courseRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Course request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    return this.prisma.courseRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async getInstructorRequests(userId: string, skip: number = 0, take: number = 20) {
    const [data, total] = await Promise.all([
      this.prisma.courseRequest.findMany({
        where: { instructorId: userId },
        skip,
        take,
        include: {
          reviewedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              published: true,
              coverImage: { select: { id: true, url: true, filename: true } },
              _count: { select: { lessons: true, quizzes: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.courseRequest.count({
        where: { instructorId: userId },
      }),
    ]);

    return {
      data,
      paging: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  async getStats() {
    // Count explicit requests by status
    const [explicitPending, approved, rejected] = await Promise.all([
      this.prisma.courseRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.courseRequest.count({ where: { status: 'APPROVED' } }),
      this.prisma.courseRequest.count({ where: { status: 'REJECTED' } }),
    ]);

    // Count draft courses (also treated as pending)
    const draftCount = await this.prisma.course.count({
      where: {
        published: false,
        responsible: { role: 'INSTRUCTOR' },
        courseRequests: {
          none: {
            status: { in: ['PENDING', 'APPROVED'] },
          },
        },
      },
    });

    const pending = explicitPending + draftCount;

    return {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    };
  }
}
