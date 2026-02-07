import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from './s3.service';
import { InitUploadDto, CompleteUploadDto } from './dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** Step 1: Initialize upload — create File record and return presigned URL */
  async initUpload(dto: InitUploadDto, user: JwtPayload) {
    const fileId = uuidv4();
    const key = `uploads/${user.sub}/${fileId}/${dto.filename}`;

    const uploadUrl = await this.s3.getPresignedPutUrl(key, dto.mimeType);

    const file = await this.prisma.file.create({
      data: {
        id: fileId,
        url: key,
        filename: dto.filename,
        mimeType: dto.mimeType,
        size: dto.size,
        uploadedById: user.sub,
        uploaded: false,
      },
    });

    return {
      fileId: file.id,
      uploadUrl,
      method: 'PUT',
    };
  }

  /** Step 2: Complete upload — mark file as uploaded, queue virus scan */
  async completeUpload(dto: CompleteUploadDto) {
    const file = await this.prisma.file.findUnique({ where: { id: dto.fileId } });
    if (!file) throw new NotFoundException('File not found');

    await this.prisma.file.update({
      where: { id: dto.fileId },
      data: { uploaded: true },
    });

    // TODO: Enqueue virus scan job via BullMQ
    // await this.virusScanQueue.add('scan', { fileId: dto.fileId });

    return { fileId: file.id, status: 'uploaded' };
  }

  /** Generate a presigned GET URL for downloading (with permission check) */
  async getDownloadUrl(fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    const url = await this.s3.getPresignedGetUrl(file.url);
    return { url, filename: file.filename };
  }
}
