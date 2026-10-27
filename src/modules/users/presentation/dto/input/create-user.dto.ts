import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  NON_BLANK_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STRONG_PASSWORD_PATTERN,
  USER_NAME_MAX_LENGTH,
  USER_NAME_MIN_LENGTH,
} from '@shared/domain/constraints';
import { EmailField } from '@shared/presentation/dto';

export class CreateUserDto {
  @ApiProperty({
    example: 'Jane Doe',
    minLength: USER_NAME_MIN_LENGTH,
    maxLength: USER_NAME_MAX_LENGTH,
    pattern: NON_BLANK_PATTERN.source,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(NON_BLANK_PATTERN, {
    message: i18nValidationMessage('validation.NOT_EMPTY'),
  })
  @MaxLength(USER_NAME_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  name!: string;

  @EmailField({ example: 'user@email.com' })
  email!: string;

  @ApiProperty({
    example: 'N3wStrongPass!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    pattern: STRONG_PASSWORD_PATTERN.source,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: i18nValidationMessage('validation.MIN_LENGTH'),
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  @Matches(STRONG_PASSWORD_PATTERN, {
    message: i18nValidationMessage('validation.STRONG_PASSWORD'),
  })
  password!: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayNotEmpty({
    message: i18nValidationMessage('validation.ARRAY_NOT_EMPTY'),
  })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('validation.IS_UUID'),
  })
  roleUuids!: string[];
}
