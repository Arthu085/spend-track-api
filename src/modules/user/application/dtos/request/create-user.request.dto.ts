import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserRequestDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João da Silva',
  })
  @IsNotEmpty({ message: 'O nome completo é obrigatório' })
  @IsString({ message: 'O nome completo deve ser uma string' })
  @MinLength(3, {
    message: 'O nome completo deve conter pelo menos 3 caracteres',
  })
  @MaxLength(255, {
    message: 'O nome completo deve conter no máximo 255 caracteres',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Endereço de email do usuário',
    example: 'joao.silva@example.com',
  })
  @IsNotEmpty({ message: 'O endereço de email é obrigatório' })
  @IsEmail({}, { message: 'O endereço de email deve ser válido' })
  @MaxLength(255, {
    message: 'O endereço de email deve conter no máximo 255 caracteres',
  })
  email!: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'P@ssw0rd!',
  })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @IsString({ message: 'A senha deve ser uma string' })
  @MinLength(8, {
    message: 'A senha deve conter pelo menos 8 caracteres',
  })
  @MaxLength(255, {
    message: 'A senha deve conter no máximo 255 caracteres',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'A senha deve conter pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial',
  })
  password!: string;

  @ApiProperty({
    description: 'UUID da função do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'O UUID da função é obrigatório' })
  @IsUUID('4', { message: 'O UUID da função deve ser um UUID válido' })
  roleUuid!: string;
}
