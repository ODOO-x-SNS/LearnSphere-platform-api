import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Visibility, AccessRule } from '@prisma/client';

export class CreateCourseDto {
  @ApiProperty({ example: 'Introduction to TypeScript' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateCourseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverImageId?: string;
  @ApiPropertyOptional({ enum: Visibility }) @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
  @ApiPropertyOptional({ enum: AccessRule }) @IsOptional() @IsEnum(AccessRule) accessRule?: AccessRule;
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
}

export class QueryCoursesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() limit?: number = 20;
  @ApiPropertyOptional({ enum: Visibility }) @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
}
