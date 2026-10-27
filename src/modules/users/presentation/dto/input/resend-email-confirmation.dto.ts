import { EmailField } from '@shared/presentation/dto';

export class ResendEmailConfirmationDto {
  @EmailField({ example: 'user@email.com' })
  email!: string;
}
