import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { abilityPairKey } from '@shared/domain/authorization/ability-pair-key';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';

export class AbilityPairDto {
  @ApiProperty({ enum: Action })
  @IsEnum(Action, { message: i18nValidationMessage('validation.IS_ENUM') })
  action!: Action;

  @ApiProperty({ enum: Subject })
  @IsEnum(Subject, { message: i18nValidationMessage('validation.IS_ENUM') })
  subject!: Subject;
}

export class UpdateRoleAbilitiesDto {
  @ApiProperty({ type: [AbilityPairDto], uniqueItems: true })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayUnique(abilityPairKey, {
    message: i18nValidationMessage('validation.ARRAY_UNIQUE'),
  })
  @ValidateNested({ each: true })
  @Type(() => AbilityPairDto)
  abilities!: AbilityPairDto[];
}
