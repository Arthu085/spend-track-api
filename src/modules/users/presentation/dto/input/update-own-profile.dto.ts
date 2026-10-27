import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PASSWORD_MAX_LENGTH } from '@shared/domain/constraints';
import { UpdateUserDto } from './update-user.dto';

export class UpdateOwnProfileDto extends PickType(UpdateUserDto, [
  'name',
  'email',
] as const) {
  @ApiPropertyOptional({
    description:
      'Required when `email` changes to a different address; ignored otherwise.',
    example: 'Admin@123',
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @ValidateIf((_: object, value: unknown) => value !== undefined)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  currentPassword?: string;
}
