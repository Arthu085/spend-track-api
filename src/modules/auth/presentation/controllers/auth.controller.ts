import { Body, Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { LoginResponseDto } from '../../application/dtos/response/login.response.dto';
import { LoginRequestDto } from '../../application/dtos/request/login.request.dto';
import { ProfileUseCase } from '../../application/use-cases/profile.use-case';
import { ProfileResponseDto } from '../../application/dtos/response/profile.response.dto';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { AuthUser } from '../../domain/types/auth-user.type';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly profileUseCase: ProfileUseCase,
  ) {}

  @Endpoint.post({
    url: 'login',
    description: 'Realizar login',
    dtoName: 'LoginRequestDto',
    isProtected: false,
    responses: [
      {
        status: 200,
        description: 'Login realizado com sucesso',
        responseType: LoginResponseDto,
      },
    ],
    responseMessage: 'Login realizado com sucesso',
  })
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.loginUseCase.execute(dto);
  }

  @Endpoint.get({
    url: 'profile',
    description: 'Retornar dados do usuário autenticado',
    isProtected: true,
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
