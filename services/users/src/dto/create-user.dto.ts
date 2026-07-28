import { IsEmail, IsEnum, IsString, IsStrongPassword, Length } from 'class-validator';
import { UserGender } from 'src/entities/userGender.enum';
import { UserRole } from 'src/entities/userRole.enum';
export class CreateUserDto {

  @IsString()
  username: string;

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
        'password should contain at least one lowercase letter, one uppercase letter, one number, and one symbol',
    },
  )
  password: string;
  
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;

 @IsEnum(UserGender)
  gender?: UserGender;
}
