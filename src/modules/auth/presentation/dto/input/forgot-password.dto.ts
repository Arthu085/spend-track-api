import { EmailField } from '@shared/presentation/dto';

export class ForgotPasswordDto {
  @EmailField({ example: 'admin@email.com' })
  email!: string;
}
