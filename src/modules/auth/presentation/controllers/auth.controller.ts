import { Body, Controller, HttpCode, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { EnvOptions } from 'src/core/config/env/types/env.types';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { getCookieConfig } from 'src/core/config/auth/cookie.config';
import { LoginResponseDto } from '../../application/dtos/response/login.response.dto';
import { LoginRequestDto } from '../../application/dtos/request/login.request.dto';
import { ProfileUseCase } from '../../application/use-cases/profile.use-case';
import { ProfileResponseDto } from '../../application/dtos/response/profile.response.dto';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { AuthUser } from '../../domain/types/auth-user.type';
import { RefreshUseCase } from '../../application/use-cases/refresh.use-case';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly profileUseCase: ProfileUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Endpoint.post({
    url: 'login',
    description: 'Realizar login',
    dtoName: 'LoginRequestDto',
    authType: 'none',
    responses: [
      {
        status: 200,
        description: 'Login realizado com sucesso',
        responseType: LoginResponseDto,
      },
    ],
    responseMessage: 'Login realizado com sucesso',
  })
  @HttpCode(200)
  async login(
    @Body() dto: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const env = this.configService.get<EnvOptions>('env')!;
    const cookieConfig = getCookieConfig(env);

    const result = await this.loginUseCase.execute(dto);

    response.cookie('token', result.accessToken, {
      ...cookieConfig,
      maxAge: env.COOKIE_ACCESS_MAX_AGE,
    });

    response.cookie('refreshToken', result.refreshToken, {
      ...cookieConfig,
      maxAge: env.COOKIE_REFRESH_MAX_AGE,
    });

    return result;
  }

  @Endpoint.post({
    url: 'refresh',
    description: 'Realizar refresh do token',
    authType: 'refresh',
    responses: [
      {
        status: 200,
        description: 'Sessão renovada com sucesso',
        responseType: LoginResponseDto,
      },
    ],
    responseMessage: 'Sessão renovada com sucesso',
  })
  @HttpCode(200)
  refresh(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): LoginResponseDto {
    const env = this.configService.get<EnvOptions>('env')!;
    const cookieConfig = getCookieConfig(env);

    const result = this.refreshUseCase.execute(user);

    response.cookie('token', result.accessToken, {
      ...cookieConfig,
      maxAge: env.COOKIE_ACCESS_MAX_AGE,
    });

    response.cookie('refreshToken', result.refreshToken, {
      ...cookieConfig,
      maxAge: env.COOKIE_REFRESH_MAX_AGE,
    });

    return result;
  }

  @Endpoint.post({
    url: 'logout',
    description: 'Encerrar sessão do usuário',
    authType: 'access',
    responses: [
      {
        status: 200,
        description: 'Logout realizado com sucesso',
      },
    ],
    responseMessage: 'Logout realizado com sucesso',
  })
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    const env = this.configService.get<EnvOptions>('env')!;
    const cookieConfig = getCookieConfig(env);

    response.clearCookie('token', cookieConfig);
    response.clearCookie('refreshToken', cookieConfig);

    return;
  }

  @Endpoint.get({
    url: 'profile',
    description: 'Retornar dados do usuário autenticado',
    authType: 'access',
    responses: [
      {
        status: 200,
        description: 'Usuário retornado com sucesso',
        responseType: ProfileResponseDto,
      },
    ],
    responseMessage: 'Usuário retornado com sucesso',
  })
  async profile(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.profileUseCase.execute(user.uuid);
  }
}
