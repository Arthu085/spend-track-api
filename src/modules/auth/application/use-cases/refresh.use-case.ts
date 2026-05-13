import { Inject, Injectable } from '@nestjs/common';
import { ITokenService } from '../../domain/services/token.service';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { LoginResponseDto } from '../dtos/response/login.response.dto';
import { AuthUser } from '../../domain/types/auth-user.type';

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject('ITokenService')
    private readonly tokenService: ITokenService,
  ) {}

  execute(user: AuthUser): LoginResponseDto {
    const payload: JwtPayload = {
      sub: user.uuid,
      roleUuid: user.roleUuid,
    };

    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    return new LoginResponseDto(accessToken, refreshToken);
  }
}
