import {
  RoleEnum,
  RoleEnumTranslation,
} from 'src/modules/access-control/domain/enums/role.enum';

export class ProfileResponseDto {
  uuid: string;
  roleUuid: string;
  fullName: string;
  email: string;
  role: RoleEnum;
  roleLabel: string;

  constructor(props: {
    uuid: string;
    roleUuid: string;
    fullName: string;
    email: string;
    role: RoleEnum;
  }) {
    this.uuid = props.uuid;
    this.roleUuid = props.roleUuid;
    this.fullName = props.fullName;
    this.email = props.email;
    this.role = props.role;
    this.roleLabel = RoleEnumTranslation[props.role] ?? props.role;
  }
}
