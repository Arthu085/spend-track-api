import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRecurringInvestmentContributions1793897757086 implements MigrationInterface {
    name = 'AddRecurringInvestmentContributions1793897757086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "chk_recurrences_target"`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD "investment_id" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."investment_id" IS 'Investment receiving the contributions; set only on investment contributions and fixed at creation.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD "minimum_retained_balance" numeric(14,2)`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."minimum_retained_balance" IS 'Saving strategy: balance to keep in the account before suggesting additional contributions.'`);
        await queryRunner.query(`CREATE TYPE "public"."recurrences_additional_contribution_strategy_enum" AS ENUM('NONE', 'REMAINING_SURPLUS')`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD "additional_contribution_strategy" "public"."recurrences_additional_contribution_strategy_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."additional_contribution_strategy" IS 'Saving strategy: how additional contributions are suggested; null without a strategy.'`);
        await queryRunner.query(`CREATE TYPE "public"."investment_movements_contribution_kind_enum" AS ENUM('ONE_TIME', 'MANDATORY', 'ADDITIONAL')`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "contribution_kind" "public"."investment_movements_contribution_kind_enum" NOT NULL DEFAULT 'ONE_TIME'`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."contribution_kind" IS 'ONE_TIME for a manual movement, MANDATORY for a recurring contribution occurrence, ADDITIONAL for an accepted surplus contribution.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "recurrence_id" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."recurrence_id" IS 'Recurrence behind a MANDATORY or ADDITIONAL contribution.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "recurrence_date" date`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."recurrence_date" IS 'Scheduled date of a MANDATORY contribution in its recurrence; never changes, even when date is edited.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "surplus_month" date`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."surplus_month" IS 'First day of the month an ADDITIONAL contribution belongs to.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "suggested_amount" numeric(14,2)`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."suggested_amount" IS 'Additional amount suggested when an ADDITIONAL contribution was accepted; immutable snapshot.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD "retained_minimum" numeric(14,2)`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."retained_minimum" IS 'Minimum retained balance when an ADDITIONAL contribution was accepted; immutable snapshot.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142"`);
        await queryRunner.query(`ALTER TYPE "public"."recurrences_type_enum" ADD VALUE 'INVESTMENT_CONTRIBUTION'`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."type" IS 'Income, expense, or investment contribution; fixed at creation.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" ALTER COLUMN "category_id" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."category_id" IS 'Global or personal category whose kind matches the type; null for investment contributions.'`);
        await queryRunner.query(`CREATE INDEX "idx_recurrences_investment_id" ON "recurrences"  ("investment_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_investment_movements_additional_month" ON "investment_movements"  ("recurrence_id", "surplus_month") WHERE "contribution_kind" = 'ADDITIONAL' AND "state" <> 'CANCELED' AND "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_investment_movements_recurrence_occurrence" ON "investment_movements"  ("recurrence_id", "recurrence_date") WHERE "contribution_kind" = 'MANDATORY' AND "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "chk_recurrences_saving_strategy" CHECK (("minimum_retained_balance" IS NULL AND "additional_contribution_strategy" IS NULL) OR ("minimum_retained_balance" >= 0 AND "additional_contribution_strategy" IS NOT NULL AND "type"::text = 'INVESTMENT_CONTRIBUTION' AND "frequency" = 'MONTHLY'))`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "chk_recurrences_investment_contribution" CHECK (("type"::text = 'INVESTMENT_CONTRIBUTION' AND "investment_id" IS NOT NULL AND "account_id" IS NOT NULL AND "credit_card_id" IS NULL AND "category_id" IS NULL) OR ("type"::text <> 'INVESTMENT_CONTRIBUTION' AND "investment_id" IS NULL AND "category_id" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "chk_recurrences_target_kind" CHECK (("account_id" IS NULL) <> ("credit_card_id" IS NULL) AND ("credit_card_id" IS NULL OR "type"::text = 'EXPENSE'))`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD CONSTRAINT "chk_investment_movements_contribution_kind" CHECK (("contribution_kind" = 'ONE_TIME' AND "recurrence_id" IS NULL AND "recurrence_date" IS NULL AND "surplus_month" IS NULL AND "suggested_amount" IS NULL AND "retained_minimum" IS NULL) OR ("contribution_kind" = 'MANDATORY' AND "type" = 'CONTRIBUTION' AND "recurrence_id" IS NOT NULL AND "recurrence_date" IS NOT NULL AND "surplus_month" IS NULL AND "suggested_amount" IS NULL AND "retained_minimum" IS NULL) OR ("contribution_kind" = 'ADDITIONAL' AND "type" = 'CONTRIBUTION' AND "recurrence_id" IS NOT NULL AND "recurrence_date" IS NULL AND "surplus_month" IS NOT NULL AND "suggested_amount" IS NOT NULL AND "retained_minimum" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_e750210713b694fdc4323143b4c" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "investment_movements" ADD CONSTRAINT "FK_d646609d74481196983cd75d7dd" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP CONSTRAINT "FK_d646609d74481196983cd75d7dd"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_e750210713b694fdc4323143b4c"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142"`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP CONSTRAINT "chk_investment_movements_contribution_kind"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "chk_recurrences_target_kind"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "chk_recurrences_investment_contribution"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "chk_recurrences_saving_strategy"`);
        await queryRunner.query(`DROP INDEX "public"."uq_investment_movements_recurrence_occurrence"`);
        await queryRunner.query(`DROP INDEX "public"."uq_investment_movements_additional_month"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrences_investment_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."category_id" IS 'Global or personal category whose kind matches the type.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" ALTER COLUMN "category_id" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."type" IS 'Income or expense; fixed at creation.'`);
        await queryRunner.query(`CREATE TYPE "public"."recurrences_type_enum_old" AS ENUM('INCOME', 'EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "recurrences" ALTER COLUMN "type" TYPE "public"."recurrences_type_enum_old" USING "type"::"text"::"public"."recurrences_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."recurrences_type_enum_old" RENAME TO "recurrences_type_enum"`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."retained_minimum" IS 'Minimum retained balance when an ADDITIONAL contribution was accepted; immutable snapshot.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "retained_minimum"`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."suggested_amount" IS 'Additional amount suggested when an ADDITIONAL contribution was accepted; immutable snapshot.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "suggested_amount"`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."surplus_month" IS 'First day of the month an ADDITIONAL contribution belongs to.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "surplus_month"`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."recurrence_date" IS 'Scheduled date of a MANDATORY contribution in its recurrence; never changes, even when date is edited.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "recurrence_date"`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."recurrence_id" IS 'Recurrence behind a MANDATORY or ADDITIONAL contribution.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "recurrence_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "investment_movements"."contribution_kind" IS 'ONE_TIME for a manual movement, MANDATORY for a recurring contribution occurrence, ADDITIONAL for an accepted surplus contribution.'`);
        await queryRunner.query(`ALTER TABLE "investment_movements" DROP COLUMN "contribution_kind"`);
        await queryRunner.query(`DROP TYPE "public"."investment_movements_contribution_kind_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."additional_contribution_strategy" IS 'Saving strategy: how additional contributions are suggested; null without a strategy.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP COLUMN "additional_contribution_strategy"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_additional_contribution_strategy_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."minimum_retained_balance" IS 'Saving strategy: balance to keep in the account before suggesting additional contributions.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP COLUMN "minimum_retained_balance"`);
        await queryRunner.query(`COMMENT ON COLUMN "recurrences"."investment_id" IS 'Investment receiving the contributions; set only on investment contributions and fixed at creation.'`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP COLUMN "investment_id"`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "chk_recurrences_target" CHECK ((((account_id IS NULL) <> (credit_card_id IS NULL)) AND ((credit_card_id IS NULL) OR (type = 'EXPENSE'::recurrences_type_enum))))`);
    }

}
