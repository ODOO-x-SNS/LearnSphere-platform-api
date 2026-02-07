import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto, SubmitAttemptDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Quizzes')
@ApiBearerAuth()
@Controller()
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Post('courses/:courseId/quizzes')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Create a quiz in a course' })
  async create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateQuizDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quizzesService.create(courseId, dto, user);
  }

  @Get('quizzes/:id')
  @ApiOperation({ summary: 'Get quiz (isCorrect hidden for learners)' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quizzesService.findById(id, user);
  }

  @Post('quizzes/:id/attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a quiz attempt (scores server-side, awards points)' })
  async submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quizzesService.submitAttempt(id, dto, user);
  }
}
