import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EnrollDto {
  @ApiPropertyOptional({ description: 'If enrolling via invitation' })
  @IsOptional()
  @IsBoolean()
  isInvited?: boolean;
}
