import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import { CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Enrollments')
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('courses/:courseId/enroll')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll in a course (validates access rules)' })
  async enroll(
    @Param('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.enrollmentsService.enroll(courseId, user);
  }

  @Get('enrollments/me')
  @ApiOperation({ summary: 'List my enrollments' })
  async myEnrollments(@CurrentUser() user: JwtPayload) {
    return this.enrollmentsService.findMyEnrollments(user.sub);
  }

  @Patch('enrollments/:id/progress')
  @ApiOperation({ summary: 'Update enrollment progress' })
  async updateProgress(
    @Param('id') id: string,
    @Body() body: { progress: any; completionPercent: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.enrollmentsService.updateProgress(
      id,
      body.progress,
      body.completionPercent,
      user.sub,
    );
  }
}
