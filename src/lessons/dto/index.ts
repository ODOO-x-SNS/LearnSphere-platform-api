import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonType } from '@prisma/client';

export class CreateLessonDto {
  @ApiProperty({ example: 'Getting Started' })
  @IsString()
  title: string;

  @ApiProperty({ enum: LessonType })
  @IsEnum(LessonType)
  type: LessonType;

  @ApiPropertyOptional() @IsOptional() @IsString() externalUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) durationSec?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDownload?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() mediaFileId?: string;
}

export class UpdateLessonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional({ enum: LessonType }) @IsOptional() @IsEnum(LessonType) type?: LessonType;
  @ApiPropertyOptional() @IsOptional() @IsString() externalUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) durationSec?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDownload?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() mediaFileId?: string;
}
