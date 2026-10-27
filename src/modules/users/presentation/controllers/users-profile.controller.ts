import { Body, Controller, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '@core/config';
import { clearAuthCookies } from '@modules/auth/presentation';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { ChangeOwnPasswordUseCase } from '../../application/use-cases/change-own-password.use-case';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { ListOwnAbilitiesUseCase } from '../../application/use-cases/list-own-abilities.use-case';
import { UpdateOwnProfileUseCase } from '../../application/use-cases/update-own-profile.use-case';
import { ChangeOwnPasswordDto } from '../dto/input/change-own-password.dto';
import { UpdateOwnProfileDto } from '../dto/input/update-own-profile.dto';
import { AbilityPairResponseDto } from '../dto/output/ability-pair.response';
import { UserDetailResponseDto } from '../dto/output/user-detail.response';

@Controller('users')
export class UsersProfileController {
  constructor(
    private readonly getUser: GetUserUseCase,
    private readonly listOwnAbilities: ListOwnAbilitiesUseCase,
    private readonly updateOwnProfile: UpdateOwnProfileUseCase,
    private readonly changeOwnPassword: ChangeOwnPasswordUseCase,
    private readonly config: AppConfigService,
  ) {}

  @(endpoint()
    .get('me')
    .successMessage('success.ok')
    .tags('users')
    .summary("Get the authenticated user's own profile")
    .response(UserDetailResponseDto)
    .build())
  async findMe(
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const user = await this.getUser.execute(actor.uuid);

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .get('me/abilities')
    .successMessage('success.ok')
    .tags('users')
    .summary("List the authenticated user's own effective abilities")
    .description(
      'Available to every authenticated user, without any ability. Returns the union of the (action, subject) pairs granted by your active roles, counting only active abilities, in no particular order. It reflects the database at request time, the same set the ability checks use.',
    )
    .response(AbilityPairResponseDto, undefined, { isArray: true })
    .build())
  async findMyAbilities(
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<AbilityPairResponseDto[]> {
    const abilities = await this.listOwnAbilities.execute(actor.uuid);

    return abilities.map((pair) => AbilityPairResponseDto.fromDomain(pair));
  }

  @(endpoint()
    .patch('me')
    .use(PublicAuthFlowThrottle())
    .audit('User.update_profile')
    .successMessage('success.updated')
    .tags('users')
    .summary("Update the authenticated user's own profile")
    .description(
      'Available to every authenticated user, without the UPDATE ability. Only name and email can be changed; any other field is ignored. Omitted fields keep their current values. Changing the email to a different address requires currentPassword and sends a notice, without the new address, to the previous one. Every successful update revokes all of your sessions and clears the auth cookies, so you must log in again; if the email changed, it must be confirmed first. Rate-limited like login.',
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Current password is incorrect.')
    .errorResponse(HttpStatus.CONFLICT, 'Email already in use.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Current password is required to change the email.',
    )
    .body(UpdateOwnProfileDto)
    .response(UserDetailResponseDto)
    .build())
  async updateMe(
    @Body() dto: UpdateOwnProfileDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDetailResponseDto> {
    const user = await this.updateOwnProfile.execute({
      actorId: actor.id,
      name: dto.name,
      email: dto.email,
      currentPassword: dto.currentPassword,
    });

    clearAuthCookies(res, this.config.cookie);

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .patch('me/password')
    .use(PublicAuthFlowThrottle())
    .audit('User.change_password')
    .successMessage('users.success.password_changed')
    .tags('users')
    .summary("Change the authenticated user's own password")
    .description(
      'Available to every authenticated user, without the UPDATE ability. Requires the current password; the new password follows the same rule as create and reset (8–128 characters with an uppercase letter, a lowercase letter, a digit, and a symbol), and may equal the current one. A successful change invalidates every outstanding password-reset link, revokes all of your sessions, and clears the auth cookies, so you must log in again with the new password. Rate-limited like login.',
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Current password is incorrect.')
    .body(ChangeOwnPasswordDto)
    .build())
  async changeMyPassword(
    @Body() dto: ChangeOwnPasswordDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.changeOwnPassword.execute({
      actorId: actor.id,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });

    clearAuthCookies(res, this.config.cookie);

    return null;
  }
}
