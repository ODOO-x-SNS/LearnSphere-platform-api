import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogInput {
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  courseId?: string;
  lessonId?: string;
  data?: any;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        courseId: input.courseId,
        lessonId: input.lessonId,
        data: input.data ?? undefined,
      },
    });
  }

  async findAll(params: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { resourceType, resourceId, actorId, cursor, limit = 50 } = params;

    return this.prisma.auditLog.findMany({
      where: {
        ...(resourceType ? { resourceType } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(actorId ? { actorId } : {}),
      },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
