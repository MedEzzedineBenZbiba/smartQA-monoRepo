import { IsEmail, IsString } from 'class-validator';

export class UpdateResetTokenDto {
  @IsEmail() email: string;
  @IsString() resetPasswordToken: string;
}
