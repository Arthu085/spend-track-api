import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTransactionsTable1793307423967 implements MigrationInterface {
    name = 'CreateTransactionsTable1793307423967'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('INCOME', 'EXPENSE', 'TRANSFER')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_state_enum" AS ENUM('PLANNED', 'COMPLETED', 'CANCELED')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'ACTIVE', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "description" character varying(150) NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "state" "public"."transactions_state_enum" NOT NULL, "completed_on" date, "canceled_at" TIMESTAMP WITH TIME ZONE, "account_id" integer NOT NULL, "destination_account_id" integer, "category_id" integer, "notes" character varying(1000), CONSTRAINT "UQ_71ee7072c1ba2c23edc34fabfee" UNIQUE ("uuid"), CONSTRAINT "chk_transactions_canceled_at" CHECK (("state" = 'CANCELED') = ("canceled_at" IS NOT NULL)), CONSTRAINT "chk_transactions_completed_on" CHECK (("state" = 'COMPLETED' AND "completed_on" IS NOT NULL) OR ("state" = 'PLANNED' AND "completed_on" IS NULL) OR "state" = 'CANCELED'), CONSTRAINT "chk_transactions_category" CHECK (("type" = 'TRANSFER') = ("category_id" IS NULL)), CONSTRAINT "chk_transactions_destination_account" CHECK (("type" = 'TRANSFER') = ("destination_account_id" IS NOT NULL) AND ("destination_account_id" IS NULL OR "destination_account_id" <> "account_id")), CONSTRAINT "chk_transactions_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id")); COMMENT ON COLUMN "transactions"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "transactions"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "transactions"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "transactions"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "transactions"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "transactions"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "transactions"."user_id" IS 'Owner of the transaction; only this user can read or change it.'; COMMENT ON COLUMN "transactions"."type" IS 'Income, expense, or transfer between own accounts; fixed at creation.'; COMMENT ON COLUMN "transactions"."description" IS 'Short description chosen by the owner.'; COMMENT ON COLUMN "transactions"."amount" IS 'Strictly positive amount in BRL; the type gives its direction.'; COMMENT ON COLUMN "transactions"."date" IS 'Due or expected date of a planned transaction, operation date of a completed one; months group by it.'; COMMENT ON COLUMN "transactions"."state" IS 'PLANNED affects projections only, COMPLETED changes actual balances, CANCELED affects nothing.'; COMMENT ON COLUMN "transactions"."completed_on" IS 'Effective payment or receipt date; set while completed, kept when a completed transaction is canceled.'; COMMENT ON COLUMN "transactions"."canceled_at" IS 'Timestamp when the transaction was canceled.'; COMMENT ON COLUMN "transactions"."account_id" IS 'Account money leaves (expense, transfer) or enters (income); owned by user_id.'; COMMENT ON COLUMN "transactions"."destination_account_id" IS 'Account a transfer moves money into; null for other types.'; COMMENT ON COLUMN "transactions"."category_id" IS 'Global or personal category whose kind matches the type; null for transfers.'; COMMENT ON COLUMN "transactions"."notes" IS 'Optional free-text notes.'`);
        await queryRunner.query(`CREATE INDEX "idx_transactions_category_id" ON "transactions"  ("category_id") `);
        await queryRunner.query(`CREATE INDEX "idx_transactions_destination_account_id" ON "transactions"  ("destination_account_id") `);
        await queryRunner.query(`CREATE INDEX "idx_transactions_account_id" ON "transactions"  ("account_id") `);
        await queryRunner.query(`CREATE INDEX "idx_transactions_user_id_date" ON "transactions"  ("user_id", "date") `);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_98c19d7f096b4ab011d3547eb0d" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_98c19d7f096b4ab011d3547eb0d"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_user_id_date"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_account_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_destination_account_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_category_id"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
    }

}
