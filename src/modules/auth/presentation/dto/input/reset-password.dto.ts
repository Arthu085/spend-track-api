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

export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3d4-....secret' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  token!: string;

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
}
