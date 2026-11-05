import { Body, Controller, HttpStatus, Query } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { BulkConfirmTransactionsUseCase } from '../../application/use-cases/bulk-confirm-transactions.use-case';
import { ListPendingConfirmationsUseCase } from '../../application/use-cases/list-pending-confirmations.use-case';
import { BulkConfirmTransactionsDto } from '../dto/input/bulk-confirm-transactions.dto';
import { ListPendingConfirmationsQueryDto } from '../dto/input/list-pending-confirmations-query.dto';
import {
  BulkConfirmationResponseDto,
  PendingConfirmationsResponseDto,
} from '../dto/output/transaction-confirmation.response';

@Controller('transactions')
export class TransactionConfirmationsController {
  constructor(
    private readonly listPendingConfirmations: ListPendingConfirmationsUseCase,
    private readonly bulkConfirmTransactions: BulkConfirmTransactionsUseCase,
  ) {}

  @(endpoint()
    .get('pending-confirmations')
    .successMessage('success.ok')
    .tags('transactions')
    .summary('List every planned transaction you can review for confirmation')
    .description(
      'Not paginated: every planned income, expense, and transfer of the authenticated user dated up to `until`, oldest first, overdue ones included. Never lists card charges or investment movements, which confirm differently. Items that cannot be confirmed today are listed with `confirmable: false` and a `blockedReason`.',
    )
    .response(PendingConfirmationsResponseDto)
    .build())
  async findPending(
    @Query() query: ListPendingConfirmationsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PendingConfirmationsResponseDto> {
    return PendingConfirmationsResponseDto.fromPending(
      await this.listPendingConfirmations.execute(actor.id, query.until),
      translate,
    );
  }

  @(endpoint()
    .post('bulk-confirmation')
    .httpCode(HttpStatus.OK)
    .audit('Transaction.bulk_confirm')
    .successMessage('success.updated')
    .tags('transactions')
    .summary('Confirm several of your planned transactions at once')
    .description(
      "Runs in one database transaction holding the owner's account lock, each item in its own savepoint with the rules of `PUT /transactions/:uuid/state`. An expected domain error (not found, including another user's transaction; inactive account; date before an opening balance date; canceled transaction) rolls back only that item and reports it as FAILED with a localized message. An unexpected error aborts every item and answers 500. An already completed transaction is reported as ALREADY_COMPLETED and left unchanged, so repeated or concurrent requests never confirm twice.",
    )
    .body(BulkConfirmTransactionsDto)
    .response(BulkConfirmationResponseDto)
    .build())
  async confirm(
    @Body() dto: BulkConfirmTransactionsDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<BulkConfirmationResponseDto> {
    return BulkConfirmationResponseDto.fromResults(
      await this.bulkConfirmTransactions.execute(
        actor.id,
        dto.items.map(({ uuid, completedOn }) => ({
          uuid,
          completedOn: completedOn ?? undefined,
        })),
      ),
      translate,
    );
  }
}
