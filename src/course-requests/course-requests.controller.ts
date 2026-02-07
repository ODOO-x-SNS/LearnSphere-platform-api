import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CourseRequestsService } from './course-requests.service';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Course Requests')
@ApiBearerAuth()
@Controller('course-requests')
export class CourseRequestsController {
  constructor(private readonly service: CourseRequestsService) {}

  @Post()
  @Roles('INSTRUCTOR')
  @ApiOperation({ summary: 'Submit a new course request (instructors only)' })
  async submitRequest(@CurrentUser() user: JwtPayload, @Body() dto: { courseId: string }) {
    return this.service.submitRequest(user.sub, dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all course requests (admin only)' })
  async listRequests(
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
    @Query('status') status?: string,
  ) {
    return this.service.listRequests(parseInt(skip), parseInt(take), status);
  }

  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get course request statistics (admin only)' })
  async getStats() {
    return this.service.getStats();
  }

  @Get('my-requests')
  @Roles('INSTRUCTOR')
  @ApiOperation({ summary: 'Get my course requests (instructors only)' })
  async getMyRequests(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
  ) {
    return this.service.getInstructorRequests(user.sub, parseInt(skip), parseInt(take));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get course request details' })
  async getRequest(@Param('id') id: string) {
    return this.service.getRequest(id);
  }

  @Patch(':id/approve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve a course request (admin only)' })
  async approveRequest(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approveRequest(id, user.sub);
  }

  @Patch(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reject a course request with reason (admin only)' })
  async rejectRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: { reason: string },
  ) {
    return this.service.rejectRequest(id, user.sub, dto.reason);
  }
}
