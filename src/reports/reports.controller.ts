import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('course-progress')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Course progress report (scoped to own courses for instructors)' })
  async courseProgress(
    @CurrentUser() user: JwtPayload,
    @Query('courseId') courseId: string,
    @Query('filterStatus') filterStatus?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.reportsService.courseProgress(courseId, user, filterStatus, cursor, limit);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Dashboard stats (admin)' })
  async dashboard() {
    return this.reportsService.dashboardStats();
  }
}
