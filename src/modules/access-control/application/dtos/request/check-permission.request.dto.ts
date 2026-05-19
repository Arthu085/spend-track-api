import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';

export class PermissionCheckDto {
  @ApiProperty({ enum: ActionEnum, example: ActionEnum.CREATE })
  @IsEnum(ActionEnum)
  action!: ActionEnum;

  @ApiProperty({ enum: SubjectEnum, example: SubjectEnum.ROLE })
  @IsEnum(SubjectEnum)
  subject!: SubjectEnum;
}

export class CheckPermissionRequestDto {
  @ApiProperty({
    description: 'UUID da função',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'O UUID da função é obrigatório' })
  @IsUUID('4', { message: 'O UUID da função deve ser um UUID válido' })
  roleUuid!: string;

  @ApiProperty({
    description: 'Lista de permissões a serem checadas',
    type: [PermissionCheckDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionCheckDto)
  permissions!: PermissionCheckDto[];
}
