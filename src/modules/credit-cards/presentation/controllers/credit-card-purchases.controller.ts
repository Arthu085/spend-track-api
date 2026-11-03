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
import { CreateCreditCardPurchaseUseCase } from '../../application/use-cases/create-credit-card-purchase.use-case';
import { CreateCreditCardRefundUseCase } from '../../application/use-cases/create-credit-card-refund.use-case';
import { DeleteCreditCardPurchaseUseCase } from '../../application/use-cases/delete-credit-card-purchase.use-case';
import { DeleteCreditCardRefundUseCase } from '../../application/use-cases/delete-credit-card-refund.use-case';
import { GetCreditCardPurchaseUseCase } from '../../application/use-cases/get-credit-card-purchase.use-case';
import { ListCreditCardPurchasesUseCase } from '../../application/use-cases/list-credit-card-purchases.use-case';
import { UpdateCreditCardPurchaseUseCase } from '../../application/use-cases/update-credit-card-purchase.use-case';
import { CreateCreditCardPurchaseDto } from '../dto/input/create-credit-card-purchase.dto';
import { CreateCreditCardRefundDto } from '../dto/input/create-credit-card-refund.dto';
import { ListCreditCardPurchasesQueryDto } from '../dto/input/list-credit-card-purchases-query.dto';
import { UpdateCreditCardPurchaseDto } from '../dto/input/update-credit-card-purchase.dto';
import { CreditCardPurchaseResponseDto } from '../dto/output/credit-card-purchase.response';
import { CreditCardRefundResponseDto } from '../dto/output/credit-card-refund.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's purchase answers 404, whatever the caller's roles.";

@Controller('credit-card-purchases')
export class CreditCardPurchasesController {
  constructor(
    private readonly listCreditCardPurchases: ListCreditCardPurchasesUseCase,
    private readonly getCreditCardPurchase: GetCreditCardPurchaseUseCase,
    private readonly createCreditCardPurchase: CreateCreditCardPurchaseUseCase,
    private readonly createCreditCardRefund: CreateCreditCardRefundUseCase,
    private readonly updateCreditCardPurchase: UpdateCreditCardPurchaseUseCase,
    private readonly deleteCreditCardPurchase: DeleteCreditCardPurchaseUseCase,
    private readonly deleteCreditCardRefund: DeleteCreditCardRefundUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary("List the authenticated user's credit card purchases")
    .description(
      `Ordered by purchase date, newest first. from/to are inclusive on purchaseDate. ${OWNERSHIP_NOTE}`,
    )
    .paginatedResponse(CreditCardPurchaseResponseDto)
    .build())
  async findAll(
    @Query() query: ListCreditCardPurchasesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<CreditCardPurchaseResponseDto>> {
    const purchases = await this.listCreditCardPurchases.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      cardUuid: query.cardUuid,
      categoryUuid: query.categoryUuid,
      from: query.from,
      to: query.to,
      description: query.description,
    });

    return purchases.map((purchase) =>
      CreditCardPurchaseResponseDto.fromDomain(purchase, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary('Get one of your credit card purchases by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Purchase not found.')
    .response(CreditCardPurchaseResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPurchaseResponseDto> {
    const purchase = await this.getCreditCardPurchase.execute(uuid, actor.id);

    return CreditCardPurchaseResponseDto.fromDomain(purchase, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('CreditCardPurchase.create')
    .successMessage('success.created')
    .tags('credit-cards')
    .summary('Record a single or installment purchase on a credit card')
    .description(
      'Splits the amount into installmentCount monthly installments that add up to it and bills them on consecutive invoices, starting with the first invoice whose closing date is after purchaseDate. It counts as spending; no account balance changes until an invoice is paid. Card and category resolve within your own records (404) and must be active (409).',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Card or category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Card or category is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Category is not an expense category, or the amount is too small for the installments.',
    )
    .body(CreateCreditCardPurchaseDto)
    .response(CreditCardPurchaseResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateCreditCardPurchaseDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPurchaseResponseDto> {
    const purchase = await this.createCreditCardPurchase.execute({
      ownerId: actor.id,
      cardUuid: dto.cardUuid,
      categoryUuid: dto.categoryUuid,
      description: dto.description,
      amount: parseMoney(dto.amount),
      purchaseDate: dto.purchaseDate,
      installmentCount: dto.installmentCount ?? 1,
      notes: dto.notes ?? null,
    });

    return CreditCardPurchaseResponseDto.fromDomain(purchase, translate);
  }

  @(endpoint()
    .post(':uuid/refunds')
    .httpCode(HttpStatus.CREATED)
    .audit('CreditCardRefund.create')
    .successMessage('success.created')
    .tags('credit-cards')
    .summary('Refund one of your purchases, fully or partially')
    .description(
      `Credits the invoice of the refund date, even if it is already paid: the leftover credit carries over to the next invoice. Refunds of a purchase never exceed its amount, and the date cannot be before the purchase date (422). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Purchase not found.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Refund exceeds the refundable amount or predates the purchase.',
    )
    .body(CreateCreditCardRefundDto)
    .response(CreditCardRefundResponseDto, HttpStatus.CREATED)
    .build())
  async refund(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: CreateCreditCardRefundDto,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<CreditCardRefundResponseDto> {
    const refund = await this.createCreditCardRefund.execute({
      purchaseUuid: uuid,
      ownerId: actor.id,
      amount: parseMoney(dto.amount),
      date: dto.date,
      notes: dto.notes ?? null,
    });

    return CreditCardRefundResponseDto.fromDomain(refund);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('CreditCardPurchase.update')
    .successMessage('success.updated')
    .tags('credit-cards')
    .summary('Update the description, category, or notes of a purchase')
    .description(
      `Financial fields never change: delete a purchase that is not billed yet and record it again, or refund it. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Purchase or category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Category is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Category is not an expense category.',
    )
    .body(UpdateCreditCardPurchaseDto)
    .response(CreditCardPurchaseResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateCreditCardPurchaseDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPurchaseResponseDto> {
    const purchase = await this.updateCreditCardPurchase.execute({
      uuid,
      ownerId: actor.id,
      description: dto.description,
      categoryUuid: dto.categoryUuid,
      notes: dto.notes,
    });

    return CreditCardPurchaseResponseDto.fromDomain(purchase, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('CreditCardPurchase.delete')
    .successMessage('success.deleted')
    .tags('credit-cards')
    .summary('Soft-delete a purchase that is not billed yet')
    .description(
      `Only while every installment sits on an open invoice and nothing was refunded; otherwise refund it to keep the history (409). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Purchase not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Purchase is billed on a closed invoice or has refunds.',
    )
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteCreditCardPurchase.execute({ uuid, ownerId: actor.id });
  }

  @(endpoint()
    .delete(':uuid/refunds/:refundUuid')
    .audit('CreditCardRefund.delete')
    .successMessage('success.deleted')
    .tags('credit-cards')
    .summary('Soft-delete a refund whose invoice is still open')
    .description(
      `A refund credited on a closed invoice is history and cannot be deleted (409). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Purchase or refund not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Refund invoice is closed.')
    .build())
  async removeRefund(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('refundUuid', ParseUuidParamPipe) refundUuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteCreditCardRefund.execute({
      purchaseUuid: uuid,
      refundUuid,
      ownerId: actor.id,
    });
  }
}
