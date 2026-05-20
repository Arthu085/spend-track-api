import { ITokenService } from '../../domain/services/token.service';
import { LoginRequestDto } from '../dtos/request/login.request.dto';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { LoginResponseDto } from '../dtos/response/login.response.dto';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserEmail } from 'src/modules/user/domain/value-objects/user-email.vo';
import { Inject, Injectable } from '@nestjs/common';
import { IPasswordHasher } from 'src/core/domain/services/password-hasher.interface';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject('ITokenService')
    private readonly tokenService: ITokenService,
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    @Inject('IPasswordHasher')
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const params = {
      email: UserEmail.create(dto.email),
      password: dto.password,
    };

    const user = await this.userRepo.findByEmail(params.email);

    if (!user) {
      throw new AppUnauthorizedException({ message: 'Credenciais inválidas' });
    }

    const isPasswordValid = await this.passwordHasher.compare(
      params.password,
      user.password.getValue(),
    );

    if (!isPasswordValid) {
      throw new AppUnauthorizedException({ message: 'Credenciais inválidas' });
    }

    const payload: JwtPayload = {
      sub: user.uuid.toString(),
      roleUuid: user.role.uuid.toString(),
    };

    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    const hashedRefreshToken = await this.passwordHasher.hash(refreshToken, 10);
    user.updateHashedRefreshToken(hashedRefreshToken);
    await this.userRepo.save(user);

    return new LoginResponseDto(accessToken, refreshToken);
  }
}
