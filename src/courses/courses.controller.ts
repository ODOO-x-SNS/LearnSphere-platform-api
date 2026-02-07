import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, QueryCoursesDto } from './dto';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published courses (public)' })
  async findAll(@Query() query: QueryCoursesDto) {
    return this.coursesService.findAll(query);
  }

  @Get('backoffice')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List courses for backoffice (admin: all, instructor: own)' })
  async findAllBackoffice(
    @Query() query: QueryCoursesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.coursesService.findAllBackoffice(query, user);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get course by ID' })
  async findById(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new course' })
  async create(@Body() dto: CreateCourseDto, @CurrentUser() user: JwtPayload) {
    return this.coursesService.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update course' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.coursesService.update(id, dto, user);
  }

  @Post(':id/publish')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish course (validates prerequisites)' })
  async publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.coursesService.publish(id, user);
  }

  @Post(':id/unpublish')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish course' })
  async unpublish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.coursesService.unpublish(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete course' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.coursesService.delete(id, user);
  }
}
