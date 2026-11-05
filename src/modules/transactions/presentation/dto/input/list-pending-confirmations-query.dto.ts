import { DateOnlyField } from '@shared/presentation/dto';

export class ListPendingConfirmationsQueryDto {
  @DateOnlyField({
    example: '2026-11-30',
    description:
      'Last date to include; planned transactions dated up to it are listed, overdue ones included.',
  })
  until!: string;
}
