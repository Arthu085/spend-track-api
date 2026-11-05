import { Body, Controller, HttpStatus, Param } from '@nestjs/common';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CancelCreditCardPaymentUseCase } from '../../application/use-cases/cancel-credit-card-payment.use-case';
import { GetCreditCardInvoiceUseCase } from '../../application/use-cases/get-credit-card-invoice.use-case';
import { PayCreditCardInvoiceUseCase } from '../../application/use-cases/pay-credit-card-invoice.use-case';
import { RecordHistoricalSettlementUseCase } from '../../application/use-cases/record-historical-settlement.use-case';
import { PayCreditCardInvoiceDto } from '../dto/input/pay-credit-card-invoice.dto';
import { RecordHistoricalSettlementDto } from '../dto/input/record-historical-settlement.dto';
import { CreditCardInvoiceDetailResponseDto } from '../dto/output/credit-card-invoice.response';
import { CreditCardPaymentResponseDto } from '../dto/output/credit-card-payment.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's invoice answers 404, whatever the caller's roles.";

@Controller('credit-card-invoices')
export class CreditCardInvoicesController {
  constructor(
    private readonly getCreditCardInvoice: GetCreditCardInvoiceUseCase,
    private readonly payCreditCardInvoice: PayCreditCardInvoiceUseCase,
    private readonly recordHistoricalSettlement: RecordHistoricalSettlementUseCase,
    private readonly cancelCreditCardPayment: CancelCreditCardPaymentUseCase,
  ) {}

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('credit-cards')
    .summary('Get one of your invoices with its charges, refunds, and payments')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Invoice not found.')
    .response(CreditCardInvoiceDetailResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardInvoiceDetailResponseDto> {
    const detail = await this.getCreditCardInvoice.execute(uuid, actor.id);

    return CreditCardInvoiceDetailResponseDto.fromDetail(detail, translate);
  }

  @(endpoint()
    .post(':uuid/payments')
    .httpCode(HttpStatus.CREATED)
    .audit('CreditCardPayment.create')
    .successMessage('success.created')
    .tags('credit-cards')
    .summary('Pay one of your invoices, fully or partially, from an account')
    .description(
      `The amount leaves the account and lowers the invoice outstanding; it is never counted as an expense, since the purchases already were. paidOn defaults to today in America/Sao_Paulo. The amount cannot exceed the outstanding (422). Archived cards' invoices can still be paid. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Invoice or account not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Account is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Amount exceeds the invoice outstanding, or paidOn is before the opening balance date of the account.',
    )
    .body(PayCreditCardInvoiceDto)
    .response(CreditCardPaymentResponseDto, HttpStatus.CREATED)
    .build())
  async pay(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: PayCreditCardInvoiceDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPaymentResponseDto> {
    const payment = await this.payCreditCardInvoice.execute({
      invoiceUuid: uuid,
      ownerId: actor.id,
      accountUuid: dto.accountUuid,
      amount: parseMoney(dto.amount),
      paidOn: dto.paidOn ?? undefined,
    });

    return CreditCardPaymentResponseDto.fromDomain(payment, translate);
  }

  @(endpoint()
    .post(':uuid/historical-settlements')
    .httpCode(HttpStatus.CREATED)
    .audit('CreditCardPayment.recordHistoricalSettlement')
    .successMessage('success.created')
    .tags('credit-cards')
    .summary('Record that an invoice was already paid before an account opened')
    .description(
      `For a payment made before the opening balance date of the account, which the opening balance already includes. It lowers the invoice outstanding like a payment, but never changes the account balance or its opening date. paidOn must be before the opening date and not in the future; later payments use the payments route. Cancel it with the payment cancellation route and record it again to correct it. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Invoice or account not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'The same settlement (date and amount) is already recorded on this invoice.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Amount exceeds the invoice outstanding, or paidOn is not before the opening balance date of the account or is in the future.',
    )
    .body(RecordHistoricalSettlementDto)
    .response(CreditCardPaymentResponseDto, HttpStatus.CREATED)
    .build())
  async recordHistorical(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: RecordHistoricalSettlementDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPaymentResponseDto> {
    const payment = await this.recordHistoricalSettlement.execute({
      invoiceUuid: uuid,
      ownerId: actor.id,
      accountUuid: dto.accountUuid,
      amount: parseMoney(dto.amount),
      paidOn: dto.paidOn,
    });

    return CreditCardPaymentResponseDto.fromDomain(payment, translate);
  }

  @(endpoint()
    .put(':uuid/payments/:paymentUuid/cancellation')
    .audit('CreditCardPayment.cancel')
    .successMessage('success.updated')
    .tags('credit-cards')
    .summary('Cancel a payment of one of your invoices')
    .description(
      `Gives the amount back to the invoice and, for a payment from an account, to the account; a historical settlement changes no balance. The payment stays listed as history with canceledAt. Canceling twice answers 409. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Invoice or payment not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Payment is already canceled.')
    .response(CreditCardPaymentResponseDto)
    .build())
  async cancelPayment(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('paymentUuid', ParseUuidParamPipe) paymentUuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CreditCardPaymentResponseDto> {
    const payment = await this.cancelCreditCardPayment.execute({
      invoiceUuid: uuid,
      paymentUuid,
      ownerId: actor.id,
    });

    return CreditCardPaymentResponseDto.fromDomain(payment, translate);
  }
}
