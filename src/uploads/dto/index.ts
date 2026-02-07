import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitUploadDto {
  @ApiProperty({ example: 'lecture-1.mp4' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  mimeType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}

export class CompleteUploadDto {
  @ApiProperty()
  @IsString()
  fileId: string;
}
