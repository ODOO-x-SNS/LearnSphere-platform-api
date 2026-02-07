import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { InstructorRequestsService } from './instructor-requests.service';

@ApiTags('Admin – Instructor Requests')
@ApiBearerAuth()
@Controller('admin')
export class InstructorRequestsController {
  constructor(private readonly service: InstructorRequestsService) {}

  @Get('instructor-requests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List pending instructor signup requests' })
  async findAll() {
    return this.service.findAll();
  }

  @Post('approve-instructor/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an instructor signup' })
  async approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Post('reject-instructor/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an instructor signup' })
  async reject(@Param('id') id: string) {
    return this.service.reject(id);
  }
}
