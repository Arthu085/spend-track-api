import { FINANCE_NAME_MAX_LENGTH } from '@shared/domain/constraints';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  PaginationQueryDto,
  StatusFilterField,
  TextFilterField,
} from '@shared/presentation/dto';

export class ListCreditCardsQueryDto extends PaginationQueryDto {
  @TextFilterField({ maxLength: FINANCE_NAME_MAX_LENGTH })
  name?: string;

  @StatusFilterField()
  status?: RecordStatus;
}
