import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, S3Service],
  exports: [UploadsService, S3Service],
})
export class UploadsModule {}
