import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STRONG_PASSWORD_PATTERN,
} from '@shared/domain/constraints';

export class ChangeOwnPasswordDto {
  @ApiProperty({
    description: 'The password currently used to sign in.',
    example: 'Admin@123',
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  currentPassword!: string;

  @ApiProperty({
    description:
      'The new password. It may equal the current one; the change still ends every session.',
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
  newPassword!: string;
}
