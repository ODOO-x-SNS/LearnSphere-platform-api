import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Get('instructors')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all instructors (admin only)' })
  async listInstructors(@Query('skip') skip: string = '0', @Query('take') take: string = '20') {
    return this.usersService.listInstructors(parseInt(skip), parseInt(take));
  }

  @Get('instructors/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get instructor details with course info (admin only)' })
  async getInstructorDetails(@Param('id') id: string) {
    return this.usersService.getInstructorDetails(id);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export user data (GDPR)' })
  async exportData(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Users can export own data; admins can export any
    const targetId = user.role === Role.ADMIN ? id : user.sub;
    return this.usersService.exportData(targetId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete / anonymize user (GDPR)' })
  async deleteUser(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const targetId = user.role === Role.ADMIN ? id : user.sub;
    return this.usersService.deleteAccount(targetId);
  }
}
