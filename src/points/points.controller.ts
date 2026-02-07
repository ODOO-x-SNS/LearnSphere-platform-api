import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PointsService } from './points.service';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Points')
@ApiBearerAuth()
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my points transactions' })
  async myPoints(@CurrentUser() user: JwtPayload) {
    return this.pointsService.getUserPoints(user.sub);
  }

  @Post('award')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manually award points to a user (admin)' })
  async award(
    @Body() body: { userId: string; points: number; note: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pointsService.awardPoints(body.userId, body.points, body.note, user.sub);
  }
}
