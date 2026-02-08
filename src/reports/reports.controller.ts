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
  @ApiOperation({ summary: 'Course progress report — works with or without courseId' })
  async courseProgress(
    @CurrentUser() user: JwtPayload,
    @Query('courseId') courseId?: string,
    @Query('status') filterStatus?: string,
    @Query('search') search?: string,
  ) {
    return this.reportsService.courseProgress(user, courseId || undefined, filterStatus, search);
  }

  @Get('learners')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'All learners with full details' })
  async allLearners(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
  ) {
    return this.reportsService.allLearners(user, search);
  }

  @Get('reviews')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'All reviews across courses' })
  async allReviews(@CurrentUser() user: JwtPayload) {
    return this.reportsService.allReviews(user);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Dashboard stats (scoped by role)' })
  async dashboard(@CurrentUser() user: JwtPayload) {
    return this.reportsService.dashboardStats(user);
  }
}
