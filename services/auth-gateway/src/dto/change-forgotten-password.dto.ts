import { IsEmail, IsString, IsStrongPassword, Length } from 'class-validator';
import { UserRole } from 'src/enum/userRole.enum';
import { CreateUserDto } from './create-user.dto';
import { PickType } from '@nestjs/swagger';

export class ChangeForgettenPassowrdDTO {
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
      message: 'password should contain at least one lowercase letter, one uppercase letter and one number',
    }
  )
  newPassword!: string;
}
