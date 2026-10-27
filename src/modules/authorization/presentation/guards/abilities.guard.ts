import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MissingAbilityError, UnauthorizedError } from '@shared/domain/errors';
import { abilityPairKey } from '@shared/domain/authorization/ability-pair-key';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { ABILITY_METADATA_KEY } from '@shared/presentation/metadata';
import type { RequestWithActor } from '@shared/presentation/http';
import {
  USER_ABILITY_REPOSITORY,
  type UserAbilityRepository,
} from '../../domain/repositories/user-ability.repository';

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_ABILITY_REPOSITORY)
    private readonly userAbilityRepository: UserAbilityRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const required = this.reflector.getAllAndOverride<
      AbilityPair[] | undefined
    >(ABILITY_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (required === undefined || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithActor>();

    if (user === undefined) {
      throw new UnauthorizedError();
    }

    const granted = await this.userAbilityRepository.findGrantedAbilities(
      user.uuid,
    );

    const grantedKeys = new Set(granted.map((pair) => abilityPairKey(pair)));

    const missing = required.filter(
      (pair) => !grantedKeys.has(abilityPairKey(pair)),
    );

    if (missing.length > 0) {
      throw new MissingAbilityError(missing);
    }

    return true;
  }
}
