import {
  InactiveAccountError,
  findOwnedAccount,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import { assertRecordActive } from '@shared/domain/policies';
import { InvestmentEntity } from '../../domain/entities/investment.entity';
import { InvestmentMovementEntity } from '../../domain/entities/investment-movement.entity';
import { InactiveInvestmentError } from '../../domain/errors/inactive-investment.error';
import { InvestmentMovementNotFoundError } from '../../domain/errors/investment-movement-not-found.error';
import { InvestmentNotFoundError } from '../../domain/errors/investment-not-found.error';
import type { InvestmentMovementRepository } from '../../domain/repositories/investment-movement.repository';
import type { InvestmentRepository } from '../../domain/repositories/investment.repository';

export async function findOwnedInvestment(
  investmentRepository: InvestmentRepository,
  uuid: string,
  ownerId: number,
): Promise<InvestmentEntity> {
  const investment = await investmentRepository.findByUuidForOwner(
    uuid,
    ownerId,
  );

  if (!investment) {
    throw new InvestmentNotFoundError();
  }

  return investment;
}

export async function findActiveInvestment(
  investmentRepository: InvestmentRepository,
  uuid: string,
  ownerId: number,
): Promise<InvestmentEntity> {
  const investment = await findOwnedInvestment(
    investmentRepository,
    uuid,
    ownerId,
  );

  assertRecordActive(investment, new InactiveInvestmentError());

  return investment;
}

export async function findInvestmentMovement(
  movementRepository: InvestmentMovementRepository,
  uuid: string,
  investment: InvestmentEntity,
): Promise<InvestmentMovementEntity> {
  const movement = await movementRepository.findByUuidForInvestment(
    uuid,
    investment.id,
  );

  if (!movement) {
    throw new InvestmentMovementNotFoundError();
  }

  return movement;
}

export async function findActiveAccount(
  accountRepository: AccountRepository,
  uuid: string,
  ownerId: number,
): Promise<AccountEntity> {
  const account = await findOwnedAccount(accountRepository, uuid, ownerId);

  assertRecordActive(account, new InactiveAccountError());

  return account;
}
