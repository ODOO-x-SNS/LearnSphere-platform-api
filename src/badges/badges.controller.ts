import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { CurrentUser, Public } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Badges')
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all badges' })
  async findAll() {
    return this.badgesService.findAll();
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my badges' })
  async myBadges(@CurrentUser() user: JwtPayload) {
    return this.badgesService.getUserBadges(user.sub);
  }
}
