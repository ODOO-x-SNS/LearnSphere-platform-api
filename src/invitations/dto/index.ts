import { IsArray, IsEmail, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteDto {
  @ApiProperty({ example: ['alice@example.com', 'bob@example.com'] })
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  emails: string[];
}
