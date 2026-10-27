import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PASSWORD_MAX_LENGTH } from '@shared/domain/constraints';
import { EmailField } from '@shared/presentation/dto';

export class LoginDto {
  @EmailField({ example: 'admin@email.com' })
  email!: string;

  @ApiProperty({ example: 'Admin@123', maxLength: PASSWORD_MAX_LENGTH })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  password!: string;
}
