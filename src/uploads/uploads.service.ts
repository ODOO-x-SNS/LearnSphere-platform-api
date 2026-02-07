import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Upload file directly to database */
  async uploadFile(file: Express.Multer.File, user: JwtPayload) {
    const createdFile = await this.prisma.file.create({
      data: {
        url: '',
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        data: Buffer.from(file.buffer),
        uploadedById: user.sub,
        uploaded: true,
      },
    });

    // Update the URL with the correct ID-based path
    const url = `/api/v1/uploads/${createdFile.id}`;
    await this.prisma.file.update({
      where: { id: createdFile.id },
      data: { url },
    });

    return {
      id: createdFile.id,
      url,
      filename: createdFile.filename,
    };
  }

  /** Get file by ID */
  async getFile(fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        data: true,
      },
    });

    if (!file || !file.data) {
      throw new NotFoundException('File not found');
    }

    return file;
  }
}
