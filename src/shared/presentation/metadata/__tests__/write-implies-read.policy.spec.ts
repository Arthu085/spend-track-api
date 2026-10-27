import 'reflect-metadata';
import { Action } from '@shared/domain/enums/action.enum';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Type } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { UsersModule } from '@modules/users/users.module';
import { ABILITY_METADATA_KEY } from '../metadata-keys';
import type { AbilityPair } from '../../../domain/authorization/ability-pair.type';

// Any route requiring UPDATE or DELETE on a subject must also require READ on
// it. Enumerates every controller the HTTP modules register so a new write
// route without a paired READ requirement fails here.
interface ControllerUnderTest {
  name: string;
  prototype: Record<string, object>;
}

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const controllersUnderTest: ControllerUnderTest[] = [
  UsersModule,
  AuthModule,
  AuthorizationModule,
]
  .flatMap(
    (module) =>
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) as Type[],
  )
  .map((controller) => ({
    name: controller.name,
    prototype: controller.prototype as Record<string, object>,
  }));

function handlerNamesOf(prototype: Record<string, object>): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );
}

describe('write-implies-read ability policy', () => {
  for (const { name, prototype } of controllersUnderTest) {
    describe(name, () => {
      const handlerNames = handlerNamesOf(prototype);

      it('exposes at least one handler', () => {
        expect(handlerNames.length).toBeGreaterThan(0);
      });

      for (const handlerName of handlerNames) {
        it(`${handlerName}: every UPDATE/DELETE requirement is paired with READ on the same subject`, () => {
          const abilities = Reflect.getMetadata(
            ABILITY_METADATA_KEY,
            prototype[handlerName],
          ) as AbilityPair[] | undefined;

          if (!abilities) {
            return;
          }

          const writeAbilities = abilities.filter(
            (ability) =>
              ability.action === Action.UPDATE ||
              ability.action === Action.DELETE,
          );

          for (const writeAbility of writeAbilities) {
            const hasPairedRead = abilities.some(
              (ability) =>
                ability.action === Action.READ &&
                ability.subject === writeAbility.subject,
            );

            expect(hasPairedRead).toBe(true);
          }
        });
      }
    });
  }
});
