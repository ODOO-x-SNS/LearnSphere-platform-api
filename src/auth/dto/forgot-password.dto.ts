import { IsEmail, IsOptional, IsIn } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['admin', 'learner'])
  appType?: 'admin' | 'learner';
}
