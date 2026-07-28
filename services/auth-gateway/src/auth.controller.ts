import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Headers,
} from '@nestjs/common';

import { LoginUserDto } from './dto/login-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import {
  RESET_TOKEN_COOKIE,
  RESET_TOKEN_COOKIE_OPTIONS,
} from './constants/auth.constants';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { ChangeForgettenPassowrdDTO } from './dto/change-forgotten-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('check')
  healthCheck() {
    return { status: 'ok' };
  }

  // @Post('signup')
  // signup(@Body() createUserDto: CreateUserDto) {
  //   return this.authService.signup(createUserDto);
  // }

  @Post('login')
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto.username, loginUserDto.password);
  }

  @Post('refreshAccessToken')
  getNewAccessToken(@Body('refresh_token') refresh_token: string) {
    return this.authService.getNewAccessToken(refresh_token);
  }

  @Post('forgot-password')
  async forgetPassword(@Body() body) {
    await this.authService.forgetPassowrd(body.email);
    return { message: 'A password reset email was sent' };
  }

  @Get('reset-password')
  async verifyResetPasswordToken(
    @Query('resetToken') resetToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tmpJWTToUpdatePassword =
      await this.authService.verifyResetPasswordToken(resetToken);

    res.cookie(
      RESET_TOKEN_COOKIE,
      tmpJWTToUpdatePassword,
      RESET_TOKEN_COOKIE_OPTIONS,
    );

    return { message: 'Reset token verified' };
  }

  // update the user's password through his account
  @Patch('update-password')
  updatePassword(
    @Headers('authorization') authorizationHeader: string,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ) {
    const access_token = authorizationHeader.split(' ')[1];
    return this.authService.changePassword(
      updatePasswordDto.newPassword,
      updatePasswordDto.oldPassword,
      access_token,
      null,
    );
  }

  // if he forget his password
  @Patch('change-forgetten-password')
  async changePassword(
    @Req() req: Request,
    @Body() changeForgettenPassowrdDTO: ChangeForgettenPassowrdDTO,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resetToken = req.cookies[RESET_TOKEN_COOKIE];
    await this.authService.changePassword(
      changeForgettenPassowrdDTO.newPassword,
      null,
      null,
      resetToken,
    );
    res.clearCookie(RESET_TOKEN_COOKIE);
  }
}
