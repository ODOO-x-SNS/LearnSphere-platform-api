import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/* ─── Quiz Builder ─── */
export class CreateOptionDto {
  @ApiProperty() @IsString() text: string;
  @ApiProperty() @IsBoolean() isCorrect: boolean;
}

export class CreateQuestionDto {
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() multipleSelection?: boolean;
  @ApiProperty({ type: [CreateOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}

export class CreateQuizDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) pointsFirstTry?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) pointsSecondTry?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) pointsThirdTry?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) pointsFourthPlus?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMultipleAttempts?: boolean;

  @ApiProperty({ type: [CreateQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

/* ─── Quiz Attempt ─── */
export class AnswerDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) selectedOptionIds: string[];
}

export class SubmitAttemptDto {
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  @ApiPropertyOptional({ description: 'Client-side idempotency key' })
  @IsOptional()
  @IsString()
  clientAttemptId?: string;
}
