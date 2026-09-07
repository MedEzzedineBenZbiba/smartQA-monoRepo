import { IsString, IsStrongPassword, Length } from 'class-validator';

export class UpdatePasswordDto {
  @IsString()
  @Length(8, 20)
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    },
    {
      message:
        'password should contain at least one lowercase letter, one uppercase letter and one number',
    },
  )
  oldPassword!: string;

  @IsString()
  @Length(8, 20)
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    },
    {
      message:
        'password should contain at least one lowercase letter, one uppercase letter and one number',
    },
  )
  newPassword!: string;
}
