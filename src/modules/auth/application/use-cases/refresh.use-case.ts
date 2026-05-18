import { Inject, Injectable } from '@nestjs/common';
import { ITokenService } from '../../domain/services/token.service';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { LoginResponseDto } from '../dtos/response/login.response.dto';
import { AuthUser } from '../../domain/types/auth-user.type';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import * as bcrypt from 'bcrypt';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject('ITokenService')
    private readonly tokenService: ITokenService,
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(userOrDto: AuthUser): Promise<LoginResponseDto> {
    const payload: JwtPayload = {
      sub: userOrDto.uuid,
      roleUuid: userOrDto.roleUuid,
    };

    const user = await this.userRepo.findByUuid(Uuid.from(userOrDto.uuid));

    if (!user) {
      throw new AppUnauthorizedException({ message: 'Usuário não encontrado' });
    }

    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.updateHashedRefreshToken(hashedRefreshToken);

    await this.userRepo.save(user);

    return new LoginResponseDto(accessToken, refreshToken);
  }
}
