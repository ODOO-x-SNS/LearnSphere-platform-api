import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { InitUploadDto, CompleteUploadDto } from './dto';
import { CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('init')
  @ApiOperation({ summary: 'Initialize file upload — returns presigned PUT URL' })
  async init(@Body() dto: InitUploadDto, @CurrentUser() user: JwtPayload) {
    return this.uploadsService.initUpload(dto, user);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Mark upload as complete, triggers virus scan job' })
  async complete(@Body() dto: CompleteUploadDto) {
    return this.uploadsService.completeUpload(dto);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL' })
  async download(@Param('id') id: string) {
    return this.uploadsService.getDownloadUrl(id);
  }
}
