import { EmailField } from '@shared/presentation/dto';

export class ConfirmUserEmailDto {
  @EmailField({ example: 'user@email.com' })
  email!: string;
}
