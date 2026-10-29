import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { parseMoney } from '@shared/domain/money';
import { PaginatedResult } from '@shared/application/dto';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateAccountUseCase } from '../../application/use-cases/create-account.use-case';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { GetAccountUseCase } from '../../application/use-cases/get-account.use-case';
import { ListAccountsUseCase } from '../../application/use-cases/list-accounts.use-case';
import { UpdateAccountStatusUseCase } from '../../application/use-cases/update-account-status.use-case';
import { UpdateAccountUseCase } from '../../application/use-cases/update-account.use-case';
import { CreateAccountDto } from '../dto/input/create-account.dto';
import { ListAccountsQueryDto } from '../dto/input/list-accounts-query.dto';
import { UpdateAccountStatusDto } from '../dto/input/update-account-status.dto';
import { UpdateAccountDto } from '../dto/input/update-account.dto';
import { AccountResponseDto } from '../dto/output/account.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's account answers 404, whatever the caller's roles.";

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly listAccounts: ListAccountsUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly createAccount: CreateAccountUseCase,
    private readonly updateAccount: UpdateAccountUseCase,
    private readonly updateAccountStatus: UpdateAccountStatusUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('accounts')
    .summary("List the authenticated user's accounts")
    .description(
      `Defaults to ACTIVE accounts; the default account comes first, then by name. ${OWNERSHIP_NOTE}`,
    )
    .paginatedResponse(AccountResponseDto)
    .build())
  async findAll(
    @Query() query: ListAccountsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<AccountResponseDto>> {
    const accounts = await this.listAccounts.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      name: query.name,
      type: query.type,
      status: query.status,
    });

    return accounts.map((account) =>
      AccountResponseDto.fromDomain(account, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('accounts')
    .summary('Get one of your accounts by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Account not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Account is inactive.')
    .response(AccountResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<AccountResponseDto> {
    const account = await this.getAccount.execute(uuid, actor.id);

    return AccountResponseDto.fromDomain(account, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('Account.create')
    .successMessage('success.created')
    .tags('accounts')
    .summary('Create an account for the authenticated user')
    .description(
      'isDefault true makes it the default account and clears the flag on the previous one.',
    )
    .body(CreateAccountDto)
    .response(AccountResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<AccountResponseDto> {
    const account = await this.createAccount.execute({
      ownerId: actor.id,
      name: dto.name,
      type: dto.type,
      openingBalance: parseMoney(dto.openingBalance),
      openingBalanceDate: dto.openingBalanceDate,
      isDefault: dto.isDefault ?? false,
    });

    return AccountResponseDto.fromDomain(account, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('Account.update')
    .successMessage('success.updated')
    .tags('accounts')
    .summary('Update one of your accounts')
    .description(
      `Partial update: omitted fields keep their current values. isDefault true clears the flag on the previous default account. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Account not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Account is inactive.')
    .body(UpdateAccountDto)
    .response(AccountResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateAccountDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<AccountResponseDto> {
    const account = await this.updateAccount.execute({
      uuid,
      ownerId: actor.id,
      name: dto.name,
      type: dto.type,
      openingBalance:
        dto.openingBalance === undefined
          ? undefined
          : parseMoney(dto.openingBalance),
      openingBalanceDate: dto.openingBalanceDate,
      isDefault: dto.isDefault,
    });

    return AccountResponseDto.fromDomain(account, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .audit('Account.update_status')
    .successMessage('success.updated')
    .tags('accounts')
    .summary('Deactivate or reactivate one of your accounts')
    .description(
      `Deactivating (INACTIVE) keeps the account and its history and clears its default flag; reactivating does not make it the default again. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Account not found.')
    .body(UpdateAccountStatusDto)
    .response(AccountResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateAccountStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<AccountResponseDto> {
    const account = await this.updateAccountStatus.execute({
      uuid,
      ownerId: actor.id,
      status: dto.status,
    });

    return AccountResponseDto.fromDomain(account, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('Account.delete')
    .successMessage('success.deleted')
    .tags('accounts')
    .summary('Soft-delete one of your accounts')
    .description(
      `Removes the account from every list. Deactivate an account instead to keep it visible with its history. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Account not found.')
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteAccount.execute({ uuid, ownerId: actor.id });
  }
}
