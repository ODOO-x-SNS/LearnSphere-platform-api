import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { UploadsService } from './uploads.service';
import { CurrentUser, Public } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload file directly to database' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    return this.uploadsService.uploadFile(file, user);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get file by ID' })
  async getFile(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.uploadsService.getFile(id);

    if (!file.data) {
      throw new Error('File data not found');
    }

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
    });
    return new StreamableFile(file.data);
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({ summary: 'Download file' })
  async downloadFile(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.uploadsService.getFile(id);

    if (!file.data) {
      throw new Error('File data not found');
    }

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.data);
  }
}
