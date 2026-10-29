import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFinanceFoundationTables1793297764547 implements MigrationInterface {
    name = 'CreateFinanceFoundationTables1793297764547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."accounts_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."accounts_type_enum" AS ENUM('CHECKING', 'SAVINGS', 'CASH', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "accounts" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "public"."accounts_status_enum" NOT NULL DEFAULT 'ACTIVE', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "name" character varying(100) NOT NULL, "type" "public"."accounts_type_enum" NOT NULL, "opening_balance" numeric(14,2) NOT NULL DEFAULT '0', "opening_balance_date" date NOT NULL, "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_45705ce5c594e0b9f6158a43370" UNIQUE ("uuid"), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id")); COMMENT ON COLUMN "accounts"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "accounts"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "accounts"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "accounts"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "accounts"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "accounts"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "accounts"."user_id" IS 'Owner of the account; only this user can read or change it.'; COMMENT ON COLUMN "accounts"."name" IS 'Account name chosen by the owner.'; COMMENT ON COLUMN "accounts"."type" IS 'Kind of account: checking, savings, cash/wallet, or other.'; COMMENT ON COLUMN "accounts"."opening_balance" IS 'Balance in BRL on opening_balance_date, before any transaction.'; COMMENT ON COLUMN "accounts"."opening_balance_date" IS 'Date the opening balance refers to.'; COMMENT ON COLUMN "accounts"."is_default" IS 'Preselected for new transactions; at most one live account per user.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounts_default_per_user" ON "accounts"  ("user_id") WHERE "is_default" = true AND "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE INDEX "idx_accounts_user_id" ON "accounts"  ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."categories_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."categories_kind_enum" AS ENUM('INCOME', 'EXPENSE')`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "public"."categories_status_enum" NOT NULL DEFAULT 'ACTIVE', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer, "code" character varying(50), "name" character varying(100) NOT NULL, "kind" "public"."categories_kind_enum" NOT NULL, "color" character varying(7), CONSTRAINT "UQ_a4b5917e7297f757879582e1458" UNIQUE ("uuid"), CONSTRAINT "chk_categories_scope" CHECK (("user_id" IS NULL) = ("code" IS NOT NULL)), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id")); COMMENT ON COLUMN "categories"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "categories"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "categories"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "categories"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "categories"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "categories"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "categories"."user_id" IS 'Owner of a personal category, visible only to them; null for global categories.'; COMMENT ON COLUMN "categories"."code" IS 'Stable catalog code of a global category, used for its translated name; null for personal categories.'; COMMENT ON COLUMN "categories"."name" IS 'Name of a personal category; fallback name of a global category.'; COMMENT ON COLUMN "categories"."kind" IS 'Transaction type the category applies to.'; COMMENT ON COLUMN "categories"."color" IS 'Display color as #RRGGBB; null lets the client choose.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_code" ON "categories"  ("code") WHERE "code" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "idx_categories_user_id" ON "categories"  ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."user_preferences_spending_perspective_enum" AS ENUM('PURCHASE_DATE', 'INVOICE_MONTH')`);
        await queryRunner.query(`CREATE TYPE "public"."user_preferences_default_month_enum" AS ENUM('CURRENT', 'NEXT')`);
        await queryRunner.query(`CREATE TABLE "user_preferences" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" integer NOT NULL, "spending_perspective" "public"."user_preferences_spending_perspective_enum" NOT NULL DEFAULT 'PURCHASE_DATE', "default_month" "public"."user_preferences_default_month_enum" NOT NULL DEFAULT 'CURRENT', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c293b03d8a52156df363502b70e" UNIQUE ("uuid"), CONSTRAINT "PK_e8cfb5b31af61cd363a6b6d7c25" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_preferences"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "user_preferences"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "user_preferences"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "user_preferences"."user_id" IS 'Owner of these preferences; one row per user.'; COMMENT ON COLUMN "user_preferences"."spending_perspective" IS 'Month a card purchase counts in: its purchase date or its invoice month.'; COMMENT ON COLUMN "user_preferences"."default_month" IS 'Month the dashboard opens on: the current or the next one.'; COMMENT ON COLUMN "user_preferences"."updated_at" IS 'Timestamp when the preferences were last saved.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_preferences_user_id" ON "user_preferences"  ("user_id") `);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_3000dad1da61b29953f07476324" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_2296b7fe012d95646fa41921c8b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_preferences" ADD CONSTRAINT "FK_458057fa75b66e68a275647da2e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_preferences" DROP CONSTRAINT "FK_458057fa75b66e68a275647da2e"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_2296b7fe012d95646fa41921c8b"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_3000dad1da61b29953f07476324"`);
        await queryRunner.query(`DROP INDEX "public"."uq_user_preferences_user_id"`);
        await queryRunner.query(`DROP TABLE "user_preferences"`);
        await queryRunner.query(`DROP TYPE "public"."user_preferences_default_month_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_preferences_spending_perspective_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_categories_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_categories_code"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TYPE "public"."categories_kind_enum"`);
        await queryRunner.query(`DROP TYPE "public"."categories_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounts_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounts_default_per_user"`);
        await queryRunner.query(`DROP TABLE "accounts"`);
        await queryRunner.query(`DROP TYPE "public"."accounts_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."accounts_status_enum"`);
    }

}
