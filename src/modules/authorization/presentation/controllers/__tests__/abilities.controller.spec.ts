import 'reflect-metadata';
import type { Translate } from '@shared/presentation/decorators';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import {
  AUDIT_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import { AbilityEntity } from '../../../domain/entities/ability.entity';
import type { ListAbilitiesUseCase } from '../../../application/use-cases/list-abilities.use-case';
import { AbilitiesController } from '../abilities.controller';

const translate: Translate = (key) => key;

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const findAllHandler = (
  AbilitiesController.prototype as unknown as Record<string, object>
).findAll;

describe('AbilitiesController', () => {
  it('findAll maps every domain ability to an AbilityResponseDto', async () => {
    const ability = AbilityEntity.reconstitute({
      id: 1,
      uuid: 'ability-uuid',
      status: RecordStatus.ACTIVE,
      action: Action.READ,
      subject: Subject.USER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const execute = jest.fn().mockResolvedValue([ability]);

    const controller = new AbilitiesController({
      execute,
    } as unknown as ListAbilitiesUseCase);

    const result = await controller.findAll(translate);

    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('ability-uuid');
    expect(result[0].action).toBe(Action.READ);
    expect(result[0].subject).toBe(Subject.USER);
  });

  describe('GET endpoint() route metadata', () => {
    it('audits findAll as Ability.list', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findAllHandler)).toBe(
        'Ability.list',
      );
    });

    it('sets the success.ok i18n key on findAll', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findAllHandler),
      ).toBe('success.ok');
    });
  });
});
