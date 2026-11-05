import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHistoricalSettlementsToCreditCardPayments1793896076380 implements MigrationInterface {
    name = 'AddHistoricalSettlementsToCreditCardPayments1793896076380'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."credit_card_payments_source_enum" AS ENUM('ACCOUNT', 'HISTORICAL_SETTLEMENT')`);
        await queryRunner.query(`ALTER TABLE "credit_card_payments" ADD "source" "public"."credit_card_payments_source_enum" NOT NULL DEFAULT 'ACCOUNT'`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."source" IS 'ACCOUNT moves money out of the account; HISTORICAL_SETTLEMENT happened before its opening date and never changes the balance.'`);
        await queryRunner.query(`ALTER TABLE "credit_card_payments" DROP CONSTRAINT "FK_a988dfc5ef18723c22fbde78e90"`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."account_id" IS 'Account the money leaves; for a historical settlement, the account whose opening balance already includes it. Never counted as an expense.'`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."paid_on" IS 'Date the payment was made.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_credit_card_payments_historical_settlement" ON "credit_card_payments"  ("invoice_id", "paid_on", "amount") WHERE "source" = 'HISTORICAL_SETTLEMENT' AND "canceled_at" IS NULL AND "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "credit_card_payments" ADD CONSTRAINT "FK_a988dfc5ef18723c22fbde78e90" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "credit_card_payments" DROP CONSTRAINT "FK_a988dfc5ef18723c22fbde78e90"`);
        await queryRunner.query(`DROP INDEX "public"."uq_credit_card_payments_historical_settlement"`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."paid_on" IS 'Date the payment left the account.'`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."account_id" IS 'Account the money leaves; never counted as an expense.'`);
        await queryRunner.query(`ALTER TABLE "credit_card_payments" ADD CONSTRAINT "FK_a988dfc5ef18723c22fbde78e90" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`COMMENT ON COLUMN "credit_card_payments"."source" IS 'ACCOUNT moves money out of the account; HISTORICAL_SETTLEMENT happened before its opening date and never changes the balance.'`);
        await queryRunner.query(`ALTER TABLE "credit_card_payments" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TYPE "public"."credit_card_payments_source_enum"`);
    }

}
