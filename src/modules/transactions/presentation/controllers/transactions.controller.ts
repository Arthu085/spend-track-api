import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { DeleteTransactionUseCase } from '../../application/use-cases/delete-transaction.use-case';
import { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import { UpdateTransactionStateUseCase } from '../../application/use-cases/update-transaction-state.use-case';
import { UpdateTransactionUseCase } from '../../application/use-cases/update-transaction.use-case';
import { CreateTransactionDto } from '../dto/input/create-transaction.dto';
import { ListTransactionsQueryDto } from '../dto/input/list-transactions-query.dto';
import { UpdateTransactionStateDto } from '../dto/input/update-transaction-state.dto';
import { UpdateTransactionDto } from '../dto/input/update-transaction.dto';
import { TransactionResponseDto } from '../dto/output/transaction.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's transaction answers 404, whatever the caller's roles.";

const REFERENCES_NOTE =
  'Accounts and categories resolve within your own records (404 otherwise) and must be active when set (409).';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly getTransaction: GetTransactionUseCase,
    private readonly createTransaction: CreateTransactionUseCase,
    private readonly updateTransaction: UpdateTransactionUseCase,
    private readonly updateTransactionState: UpdateTransactionStateUseCase,
    private readonly deleteTransaction: DeleteTransactionUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('transactions')
    .summary("List the authenticated user's transactions")
    .description(
      `Ordered by date, newest first. from/to are inclusive on date. accountUuid matches the source or the destination account. Canceled transactions are included unless filtered out. ${OWNERSHIP_NOTE}`,
    )
    .paginatedResponse(TransactionResponseDto)
    .build())
  async findAll(
    @Query() query: ListTransactionsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<TransactionResponseDto>> {
    const transactions = await this.listTransactions.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      from: query.from,
      to: query.to,
      type: query.type,
      state: query.state,
      accountUuid: query.accountUuid,
      categoryUuid: query.categoryUuid,
      description: query.description,
    });

    return transactions.map((transaction) =>
      TransactionResponseDto.fromDomain(transaction, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('transactions')
    .summary('Get one of your transactions by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction not found.')
    .response(TransactionResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.getTransaction.execute(uuid, actor.id);

    return TransactionResponseDto.fromDomain(transaction, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('Transaction.create')
    .successMessage('success.created')
    .tags('transactions')
    .summary('Record an income, expense, or transfer')
    .description(
      `A PLANNED transaction affects projections only; a COMPLETED one changes the actual balances, with completedOn defaulting to date. ${REFERENCES_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Account or category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Account or category is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Category kind does not match the type, or a transfer uses the same account twice.',
    )
    .body(CreateTransactionDto)
    .response(TransactionResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateTransactionDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.createTransaction.execute({
      ownerId: actor.id,
      type: dto.type,
      description: dto.description,
      amount: parseMoney(dto.amount),
      date: dto.date,
      state: dto.state,
      completedOn: dto.completedOn ?? undefined,
      accountUuid: dto.accountUuid,
      destinationAccountUuid: dto.destinationAccountUuid ?? undefined,
      categoryUuid: dto.categoryUuid ?? undefined,
      notes: dto.notes ?? null,
    });

    return TransactionResponseDto.fromDomain(transaction, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('Transaction.update')
    .successMessage('success.updated')
    .tags('transactions')
    .summary('Update one of your transactions')
    .description(
      `Partial update; the type and state never change here. A planned transaction accepts every field; a completed one only description, categoryUuid, and notes (changing amount, date, or accounts answers 409); a canceled one nothing. ${REFERENCES_NOTE} ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(
      HttpStatus.NOT_FOUND,
      'Transaction, account, or category not found.',
    )
    .errorResponse(
      HttpStatus.CONFLICT,
      'Transaction cannot be edited this way, or account or category is inactive.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Account or category does not match the transaction type, or a transfer uses the same account twice.',
    )
    .body(UpdateTransactionDto)
    .response(TransactionResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.updateTransaction.execute({
      uuid,
      ownerId: actor.id,
      description: dto.description,
      amount: dto.amount === undefined ? undefined : parseMoney(dto.amount),
      date: dto.date,
      accountUuid: dto.accountUuid,
      destinationAccountUuid: dto.destinationAccountUuid,
      categoryUuid: dto.categoryUuid,
      notes: dto.notes,
    });

    return TransactionResponseDto.fromDomain(transaction, translate);
  }

  @(endpoint()
    .put(':uuid/state')
    .audit('Transaction.update_state')
    .successMessage('success.updated')
    .tags('transactions')
    .summary('Complete or cancel one of your transactions')
    .description(
      `PLANNED → COMPLETED (exactly once; completedOn defaults to today in America/Sao_Paulo and the accounts must be active), PLANNED → CANCELED, COMPLETED → CANCELED (reverses its balance effect and keeps it as history). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Invalid state transition, or account is inactive.',
    )
    .body(UpdateTransactionStateDto)
    .response(TransactionResponseDto)
    .build())
  async updateState(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateTransactionStateDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.updateTransactionState.execute({
      uuid,
      ownerId: actor.id,
      state: dto.state,
      completedOn: dto.completedOn ?? undefined,
    });

    return TransactionResponseDto.fromDomain(transaction, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('Transaction.delete')
    .successMessage('success.deleted')
    .tags('transactions')
    .summary('Soft-delete one of your planned transactions')
    .description(
      `Only PLANNED transactions can be deleted; completed and canceled ones are kept as history (cancel a completed one instead). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Transaction is not planned.')
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteTransaction.execute({ uuid, ownerId: actor.id });
  }
}
