import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBudgetsTables1793735120463 implements MigrationInterface {
    name = 'CreateBudgetsTables1793735120463'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "budgets" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" integer NOT NULL, "month" date NOT NULL, "total_limit" numeric(14,2), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_4d7c32c7471e1137ee82b9c6400" UNIQUE ("uuid"), CONSTRAINT "chk_budgets_total_limit_positive" CHECK ("total_limit" IS NULL OR "total_limit" > 0), CONSTRAINT "chk_budgets_month_first_day" CHECK (EXTRACT(DAY FROM "month") = 1), CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id")); COMMENT ON COLUMN "budgets"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "budgets"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "budgets"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "budgets"."user_id" IS 'Owner of the budget; only this user can read or change it.'; COMMENT ON COLUMN "budgets"."month" IS 'First day of the month the budget applies to; one per user.'; COMMENT ON COLUMN "budgets"."total_limit" IS 'Overall spending limit in BRL for the month; null when only category limits are set.'; COMMENT ON COLUMN "budgets"."updated_at" IS 'Timestamp when the budget was last saved.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_budgets_user_id_month" ON "budgets"  ("user_id", "month") `);
        await queryRunner.query(`CREATE TABLE "budget_category_limits" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "budget_id" integer NOT NULL, "category_id" integer NOT NULL, "amount" numeric(14,2) NOT NULL, CONSTRAINT "UQ_d40b32dd3e5d6109335f718db23" UNIQUE ("uuid"), CONSTRAINT "chk_budget_category_limits_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_b8f45d16e7fa4bcfdb6c7e476d8" PRIMARY KEY ("id")); COMMENT ON COLUMN "budget_category_limits"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "budget_category_limits"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "budget_category_limits"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "budget_category_limits"."budget_id" IS 'Monthly budget the limit belongs to.'; COMMENT ON COLUMN "budget_category_limits"."category_id" IS 'Global or personal expense category the limit applies to.'; COMMENT ON COLUMN "budget_category_limits"."amount" IS 'Spending limit in BRL for the category in the month.'`);
        await queryRunner.query(`CREATE INDEX "idx_budget_category_limits_category_id" ON "budget_category_limits"  ("category_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_budget_category_limits_budget_id_category_id" ON "budget_category_limits"  ("budget_id", "category_id") `);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budget_category_limits" ADD CONSTRAINT "FK_d4721a02851aa7993a1033096b1" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budget_category_limits" ADD CONSTRAINT "FK_0e9891f38a5e1b7b5d9d794912b" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "budget_category_limits" DROP CONSTRAINT "FK_0e9891f38a5e1b7b5d9d794912b"`);
        await queryRunner.query(`ALTER TABLE "budget_category_limits" DROP CONSTRAINT "FK_d4721a02851aa7993a1033096b1"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1"`);
        await queryRunner.query(`DROP INDEX "public"."uq_budget_category_limits_budget_id_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_budget_category_limits_category_id"`);
        await queryRunner.query(`DROP TABLE "budget_category_limits"`);
        await queryRunner.query(`DROP INDEX "public"."uq_budgets_user_id_month"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
    }

}
