import { ITokenService } from '../../domain/services/token.service';
import { LoginRequestDto } from '../dtos/request/login.request.dto';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { JwtPayload } from '../../domain/types/jwt-payload.type';
import { LoginResponseDto } from '../dtos/response/login.response.dto';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserEmail } from 'src/modules/user/domain/value-objects/user-email.vo';

export class LoginUseCase {
  constructor(
    private readonly tokenService: ITokenService,
    private readonly userRepo: IUserRepository,
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

    const isPasswordValid = await user.comparePassword(params.password);

    if (!isPasswordValid) {
      throw new AppUnauthorizedException({ message: 'Credenciais inválidas' });
    }

    const payload: JwtPayload = {
      sub: user.uuid.toString(),
      roleUuid: user.roleUuid.toString(),
    };

    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    return new LoginResponseDto(accessToken, refreshToken);
  }
}
