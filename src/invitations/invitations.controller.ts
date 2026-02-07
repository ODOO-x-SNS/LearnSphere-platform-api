import { Controller, Post, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { InviteDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Invitations')
@ApiBearerAuth()
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('courses/:courseId/invite')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Send invitations for a course' })
  async invite(
    @Param('courseId') courseId: string,
    @Body() dto: InviteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitationsService.invite(courseId, dto.emails, user);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation via token' })
  async accept(
    @Query('token') token: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitationsService.accept(token, user);
  }
}
