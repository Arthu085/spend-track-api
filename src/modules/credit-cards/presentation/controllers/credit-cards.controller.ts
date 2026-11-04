import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import { PaginationQueryDto } from '@shared/presentation/dto';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateCreditCardUseCase } from '../../application/use-cases/create-credit-card.use-case';
import { DeleteCreditCardUseCase } from '../../application/use-cases/delete-credit-card.use-case';
import { GetCreditCardUseCase } from '../../application/use-cases/get-credit-card.use-case';
import { ListCreditCardInvoicesUseCase } from '../../application/use-cases/list-credit-card-invoices.use-case';
import { ListCreditCardsUseCase } from '../../application/use-cases/list-credit-cards.use-case';
import { UpdateCreditCardStatusUseCase } from '../../application/use-cases/update-credit-card-status.use-case';
import { UpdateCreditCardUseCase } from '../../application/use-cases/update-credit-card.use-case';
import { CreateCreditCardDto } from '../dto/input/create-credit-card.dto';
import { ListCreditCardsQueryDto } from '../dto/input/list-credit-cards-query.dto';
import { UpdateCreditCardStatusDto } from '../dto/input/update-credit-card-status.dto';
import { UpdateCreditCardDto } from '../dto/input/update-credit-card.dto';
import { CreditCardInvoiceListResponseDto } from '../dto/output/credit-card-invoice.response';
import { CreditCardResponseDto } from '../dto/output/credit-card.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's card answers 404, whatever the caller's roles.";

@Controller('credit-cards')
export class CreditCardsController {
  constructor(
    private readonly listCreditCards: ListCreditCardsUseCase,
    private readonly getCreditCard: GetCreditCardUseCase,
    private readonly listCreditCardInvoices: ListCreditCardInvoicesUseCase,
    private readonly createCreditCard: CreateCreditCardUseCase,
    private readonly updateCreditCard: UpdateCreditCardUseCase,
    private readonly updateCreditCardStatus: UpdateCreditCardStatusUseCase,
    private readonly deleteCreditCard: DeleteCreditCardUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary("List the authenticated user's credit cards")
    .description(
      `Defaults to ACTIVE cards; the default card comes first, then by name. ${OWNERSHIP_NOTE}`,
    )
    .paginatedResponse(CreditCardResponseDto)
    .build())
  async findAll(
    @Query() query: ListCreditCardsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<CreditCardResponseDto>> {
    const cards = await this.listCreditCards.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      name: query.name,
      status: query.status,
    });

    return cards.map((card) =>
      CreditCardResponseDto.fromDomain(card, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary('Get one of your credit cards by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Credit card not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Credit card is archived.')
    .response(CreditCardResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardResponseDto> {
    const card = await this.getCreditCard.execute(uuid, actor.id);

    return CreditCardResponseDto.fromDomain(card, translate);
  }

  @(endpoint()
    .get(':uuid/invoices')
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary('List the invoices of one of your credit cards')
    .description(
      `Newest invoice month first, archived cards included. Invoices exist once a purchase or refund is billed on them. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Credit card not found.')
    .paginatedResponse(CreditCardInvoiceListResponseDto)
    .build())
  async findInvoices(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Query() query: PaginationQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<CreditCardInvoiceListResponseDto>> {
    const invoices = await this.listCreditCardInvoices.execute({
      cardUuid: uuid,
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
    });

    return invoices.map((statement) =>
      CreditCardInvoiceListResponseDto.fromStatement(statement, translate),
    );
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('CreditCard.create')
    .successMessage('success.created')
    .tags('credit-cards')
    .summary('Create a credit card for the authenticated user')
    .description(
      'isDefault true makes it the default card and clears the flag on the previous one.',
    )
    .body(CreateCreditCardDto)
    .response(CreditCardResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateCreditCardDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardResponseDto> {
    const card = await this.createCreditCard.execute({
      ownerId: actor.id,
      name: dto.name,
      creditLimit: parseMoney(dto.creditLimit),
      closingDay: dto.closingDay,
      dueDay: dto.dueDay,
      isDefault: dto.isDefault ?? false,
    });

    return CreditCardResponseDto.fromDomain(card, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('CreditCard.update')
    .successMessage('success.updated')
    .tags('credit-cards')
    .summary('Update one of your credit cards')
    .description(
      `Partial update. New closing and due days apply to invoices created from now on; existing invoices keep their dates. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Credit card not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Credit card is archived.')
    .body(UpdateCreditCardDto)
    .response(CreditCardResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateCreditCardDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardResponseDto> {
    const card = await this.updateCreditCard.execute({
      uuid,
      ownerId: actor.id,
      name: dto.name,
      creditLimit:
        dto.creditLimit === undefined ? undefined : parseMoney(dto.creditLimit),
      closingDay: dto.closingDay,
      dueDay: dto.dueDay,
      isDefault: dto.isDefault,
    });

    return CreditCardResponseDto.fromDomain(card, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .audit('CreditCard.update_status')
    .successMessage('success.updated')
    .tags('credit-cards')
    .summary('Archive or reactivate one of your credit cards')
    .description(
      `Archiving (INACTIVE) keeps the card with its invoices and purchases, blocks new purchases, and clears its default flag; its invoices can still be paid. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Credit card not found.')
    .body(UpdateCreditCardStatusDto)
    .response(CreditCardResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateCreditCardStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardResponseDto> {
    const card = await this.updateCreditCardStatus.execute({
      uuid,
      ownerId: actor.id,
      status: dto.status,
    });

    return CreditCardResponseDto.fromDomain(card, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('CreditCard.delete')
    .successMessage('success.deleted')
    .tags('credit-cards')
    .summary('Soft-delete one of your credit cards')
    .description(
      `A card with purchases or invoice payments cannot be deleted: archive it instead to keep its history. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Credit card not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Credit card has purchases or invoice payments; archive it instead.',
    )
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteCreditCard.execute({ uuid, ownerId: actor.id });
  }
}
