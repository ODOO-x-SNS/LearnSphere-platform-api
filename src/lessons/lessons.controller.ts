import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { LessonsService } from './lessons.service';
import { CreateLessonDto, UpdateLessonDto, ReorderLessonsDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Lessons')
@ApiBearerAuth()
@Controller()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post('courses/:courseId/lessons')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Create a lesson in a course' })
  async create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.lessonsService.create(courseId, dto, user);
  }

  @Get('courses/:courseId/lessons')
  @ApiOperation({ summary: 'List lessons for a course' })
  async findByCourse(@Param('courseId') courseId: string) {
    return this.lessonsService.findByCourse(courseId);
  }

  @Put('courses/:courseId/lessons/reorder')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Reorder lessons in a course' })
  async reorder(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderLessonsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.lessonsService.reorder(courseId, dto, user);
  }

  @Post('lessons/:lessonId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a lesson as completed for the current user' })
  async completeLesson(@Param('lessonId') lessonId: string, @CurrentUser() user: JwtPayload) {
    return this.lessonsService.completeLesson(lessonId, user);
  }

  @Get('enrollments/:courseId/progress')
  @ApiOperation({ summary: 'Get lesson progress for a course enrollment' })
  async getProgress(@Param('courseId') courseId: string, @CurrentUser() user: JwtPayload) {
    return this.lessonsService.getProgress(courseId, user);
  }

  @Patch('lessons/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Update a lesson' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.lessonsService.update(id, dto, user);
  }

  @Delete('lessons/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Soft-delete a lesson' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.lessonsService.delete(id, user);
  }
}
