import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { Roles } from '../common/decorators';

@ApiTags('Admin - AuditLogs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List audit logs (admin only)' })
  async findAll(
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('actorId') actorId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogService.findAll({
      resourceType,
      resourceId,
      actorId,
      cursor,
      limit,
    });
  }
}
