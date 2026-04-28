import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({
    description: 'Email do usuário',
    example: 'john.doe@example.com',
  })
  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'O email deve ser um endereço de email válido' })
  email: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'P@ssw0rd!',
  })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @IsString({ message: 'A senha deve ser uma string' })
  password: string;
}
