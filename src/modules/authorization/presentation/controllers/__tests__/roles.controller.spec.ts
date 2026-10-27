import 'reflect-metadata';
import type { Translate } from '@shared/presentation/decorators';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { AbilityEntity } from '../../../domain/entities/ability.entity';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { RoleEnum } from '../../../domain/enums/role.enum';
import type { GetRoleUseCase } from '../../../application/use-cases/get-role.use-case';
import type { ListRolesUseCase } from '../../../application/use-cases/list-roles.use-case';
import type { UpdateRoleAbilitiesUseCase } from '../../../application/use-cases/update-role-abilities.use-case';
import { RoleListResponseDto } from '../../dto/output/role-list.response';
import { RoleDetailResponseDto } from '../../dto/output/role-detail.response';
import { RolesController } from '../roles.controller';

const translate: Translate = (key) => key;

// Untyped record avoids @typescript-eslint/unbound-method when reading handler
// references for Reflect.getMetadata.
const controllerHandlers = RolesController.prototype as unknown as Record<
  string,
  object
>;

const findAllHandler = controllerHandlers.findAll;
const findOneHandler = controllerHandlers.findOne;
const updateAbilitiesHandler = controllerHandlers.updateAbilities;

function buildRole(): RoleEntity {
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

  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status: RecordStatus.ACTIVE,
    name: RoleEnum.ADMIN,
    abilities: [ability],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('RolesController', () => {
  it('findAll maps every domain role to a lean RoleListResponseDto', async () => {
    const execute = jest.fn().mockResolvedValue([buildRole()]);

    const controller = new RolesController(
      { execute } as unknown as ListRolesUseCase,
      {} as GetRoleUseCase,
      {} as UpdateRoleAbilitiesUseCase,
    );

    const result = await controller.findAll(translate);

    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('role-uuid');
    expect(result[0].role).toBe(RoleEnum.ADMIN);
    expect(result[0]).toBeInstanceOf(RoleListResponseDto);
    expect(result[0]).not.toBeInstanceOf(RoleDetailResponseDto);
    expect(result[0]).not.toHaveProperty('abilities');
  });

  it('findOne maps the domain role returned by the use-case into a RoleDetailResponseDto', async () => {
    const execute = jest.fn().mockResolvedValue(buildRole());

    const controller = new RolesController(
      {} as ListRolesUseCase,
      { execute } as unknown as GetRoleUseCase,
      {} as UpdateRoleAbilitiesUseCase,
    );

    const result = await controller.findOne('role-uuid', translate);

    expect(execute).toHaveBeenCalledWith('role-uuid');
    expect(result.uuid).toBe('role-uuid');
    expect(result.role).toBe(RoleEnum.ADMIN);
    expect(result).toBeInstanceOf(RoleDetailResponseDto);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities[0].uuid).toBe('ability-uuid');
    expect(result.abilities[0].action).toBe(Action.READ);
    expect(result.abilities[0].subject).toBe(Subject.USER);
  });

  it('updateAbilities forwards the uuid and body to the use-case and returns a RoleDetailResponseDto', async () => {
    const execute = jest.fn().mockResolvedValue(buildRole());

    const controller = new RolesController(
      {} as ListRolesUseCase,
      {} as GetRoleUseCase,
      { execute } as unknown as UpdateRoleAbilitiesUseCase,
    );

    const result = await controller.updateAbilities(
      'role-uuid',
      { abilities: [{ action: Action.READ, subject: Subject.USER }] },
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      roleUuid: 'role-uuid',
      abilities: [{ action: Action.READ, subject: Subject.USER }],
    });
    expect(result.uuid).toBe('role-uuid');
    expect(result).toBeInstanceOf(RoleDetailResponseDto);
    expect(result.abilities).toHaveLength(1);
  });

  describe('GET (list/read) endpoint() route metadata', () => {
    it('requires only READ on the Role subject for findAll', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        findAllHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.READ, subject: Subject.ROLE },
      ]);
    });

    it('requires only READ on the Role subject for findOne', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        findOneHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.READ, subject: Subject.ROLE },
      ]);
    });

    it('audits findAll as Role.list', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findAllHandler)).toBe(
        'Role.list',
      );
    });

    it('audits findOne as Role.read', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findOneHandler)).toBe(
        'Role.read',
      );
    });

    it('sets the success.ok i18n key on findAll', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findAllHandler),
      ).toBe('success.ok');
    });

    it('sets the success.ok i18n key on findOne', () => {
      expect(
        Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, findOneHandler),
      ).toBe('success.ok');
    });
  });

  describe('PATCH :uuid/abilities endpoint() route metadata', () => {
    it('requires UPDATE and READ on the Role subject', () => {
      const abilities = Reflect.getMetadata(
        ABILITY_METADATA_KEY,
        updateAbilitiesHandler,
      ) as AbilityPair[];

      expect(abilities).toEqual([
        { action: Action.UPDATE, subject: Subject.ROLE },
        { action: Action.READ, subject: Subject.ROLE },
      ]);
    });
  });
});
