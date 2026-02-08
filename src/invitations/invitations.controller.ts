import { Controller, Post, Get, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { InviteDto } from './dto';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('courses/:courseId/invite')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send invitation for a course' })
  async invite(
    @Param('courseId') courseId: string,
    @Body() dto: InviteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitationsService.invite(courseId, dto.emails, user);
  }

  @Public()
  @Get('invitations/validate')
  @ApiOperation({ summary: 'Validate an invite token (public)' })
  async validate(@Query('token') token: string) {
    return this.invitationsService.validateToken(token);
  }

  @Post('invitations/accept')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation via token (auto-enrolls)' })
  async accept(
    @Query('token') token: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitationsService.accept(token, user);
  }
}
