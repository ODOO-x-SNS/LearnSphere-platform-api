import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonType } from '@prisma/client';
import { Type } from 'class-transformer';

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
  @ApiPropertyOptional({ description: 'Quiz ID to link when lesson type is QUIZ' })
  @IsOptional()
  @IsString()
  quizId?: string;
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
  @ApiPropertyOptional() @IsOptional() @IsString() quizId?: string;
}

export class ReorderLessonDto {
  @ApiProperty({ description: 'Lesson ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'New sort order index' })
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderLessonsDto {
  @ApiProperty({ type: [ReorderLessonDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderLessonDto)
  lessons: ReorderLessonDto[];
}
