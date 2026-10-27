import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  NON_BLANK_PATTERN,
  USER_NAME_MAX_LENGTH,
  USER_NAME_MIN_LENGTH,
} from '@shared/domain/constraints';
import { EmailField } from '@shared/presentation/dto';

const isProvided = (_: object, value: unknown): boolean => value !== undefined;

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    minLength: USER_NAME_MIN_LENGTH,
    maxLength: USER_NAME_MAX_LENGTH,
    pattern: NON_BLANK_PATTERN.source,
  })
  @ValidateIf(isProvided)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(NON_BLANK_PATTERN, {
    message: i18nValidationMessage('validation.NOT_EMPTY'),
  })
  @MaxLength(USER_NAME_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  name?: string;

  @ValidateIf(isProvided)
  @EmailField({ example: 'user@email.com', required: false })
  email?: string;

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf(isProvided)
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayNotEmpty({
    message: i18nValidationMessage('validation.ARRAY_NOT_EMPTY'),
  })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('validation.IS_UUID'),
  })
  roleUuids?: string[];
}
