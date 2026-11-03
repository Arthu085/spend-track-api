import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRecurrencesTables1793732327942 implements MigrationInterface {
    name = 'CreateRecurrencesTables1793732327942'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."recurrences_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."recurrences_type_enum" AS ENUM('INCOME', 'EXPENSE')`);
        await queryRunner.query(`CREATE TYPE "public"."recurrences_frequency_enum" AS ENUM('WEEKLY', 'MONTHLY', 'YEARLY')`);
        await queryRunner.query(`CREATE TYPE "public"."recurrences_state_enum" AS ENUM('ACTIVE', 'PAUSED', 'ENDED')`);
        await queryRunner.query(`CREATE TABLE "recurrences" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "public"."recurrences_status_enum" NOT NULL DEFAULT 'ACTIVE', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "type" "public"."recurrences_type_enum" NOT NULL, "description" character varying(150) NOT NULL, "amount" numeric(14,2) NOT NULL, "frequency" "public"."recurrences_frequency_enum" NOT NULL, "start_date" date NOT NULL, "end_date" date, "state" "public"."recurrences_state_enum" NOT NULL, "account_id" integer, "credit_card_id" integer, "category_id" integer NOT NULL, "notes" character varying(1000), "generated_through" date, CONSTRAINT "UQ_78bffc8a54619256abcba2f01e0" UNIQUE ("uuid"), CONSTRAINT "chk_recurrences_end_date" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "chk_recurrences_target" CHECK (("account_id" IS NULL) <> ("credit_card_id" IS NULL) AND ("credit_card_id" IS NULL OR "type" = 'EXPENSE')), CONSTRAINT "chk_recurrences_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_bc886e2f5042804348556c33a2c" PRIMARY KEY ("id")); COMMENT ON COLUMN "recurrences"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "recurrences"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "recurrences"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "recurrences"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "recurrences"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "recurrences"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "recurrences"."user_id" IS 'Owner of the recurrence; only this user can read or change it.'; COMMENT ON COLUMN "recurrences"."type" IS 'Income or expense; fixed at creation.'; COMMENT ON COLUMN "recurrences"."description" IS 'Description copied to new occurrences.'; COMMENT ON COLUMN "recurrences"."amount" IS 'Expected amount in BRL copied to new occurrences.'; COMMENT ON COLUMN "recurrences"."frequency" IS 'Weekly, monthly, or yearly schedule counted from start_date.'; COMMENT ON COLUMN "recurrences"."start_date" IS 'Date of the first occurrence.'; COMMENT ON COLUMN "recurrences"."end_date" IS 'Last date an occurrence may fall on; null when open-ended.'; COMMENT ON COLUMN "recurrences"."state" IS 'ACTIVE generates occurrences, PAUSED does not, ENDED was ended as a whole.'; COMMENT ON COLUMN "recurrences"."account_id" IS 'Account of the generated transactions; null for card recurrences.'; COMMENT ON COLUMN "recurrences"."credit_card_id" IS 'Card of the generated charges; null for account recurrences.'; COMMENT ON COLUMN "recurrences"."category_id" IS 'Global or personal category whose kind matches the type.'; COMMENT ON COLUMN "recurrences"."notes" IS 'Optional free-text notes.'; COMMENT ON COLUMN "recurrences"."generated_through" IS 'Occurrences dated up to this date were generated; null before the first generation.'`);
        await queryRunner.query(`CREATE INDEX "idx_recurrences_category_id" ON "recurrences"  ("category_id") `);
        await queryRunner.query(`CREATE INDEX "idx_recurrences_credit_card_id" ON "recurrences"  ("credit_card_id") `);
        await queryRunner.query(`CREATE INDEX "idx_recurrences_account_id" ON "recurrences"  ("account_id") `);
        await queryRunner.query(`CREATE INDEX "idx_recurrences_user_id" ON "recurrences"  ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."recurrence_card_charges_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."recurrence_card_charges_state_enum" AS ENUM('PLANNED', 'COMPLETED', 'CANCELED')`);
        await queryRunner.query(`CREATE TABLE "recurrence_card_charges" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" "public"."recurrence_card_charges_status_enum" NOT NULL DEFAULT 'ACTIVE', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "recurrence_id" integer NOT NULL, "occurrence_date" date NOT NULL, "date" date NOT NULL, "description" character varying(150) NOT NULL, "amount" numeric(14,2) NOT NULL, "category_id" integer NOT NULL, "invoice_month" date NOT NULL, "state" "public"."recurrence_card_charges_state_enum" NOT NULL, "canceled_at" TIMESTAMP WITH TIME ZONE, "credit_card_purchase_id" integer, CONSTRAINT "UQ_166f8a73ad43bb7bd1f3457a54e" UNIQUE ("uuid"), CONSTRAINT "chk_recurrence_card_charges_canceled_at" CHECK (("state" = 'CANCELED') = ("canceled_at" IS NOT NULL)), CONSTRAINT "chk_recurrence_card_charges_purchase" CHECK (("state" = 'COMPLETED') = ("credit_card_purchase_id" IS NOT NULL)), CONSTRAINT "chk_recurrence_card_charges_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_8b987e663c9b3b6c615d92f7de7" PRIMARY KEY ("id")); COMMENT ON COLUMN "recurrence_card_charges"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "recurrence_card_charges"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "recurrence_card_charges"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "recurrence_card_charges"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "recurrence_card_charges"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "recurrence_card_charges"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "recurrence_card_charges"."user_id" IS 'Owner of the charge; same as the owner of its recurrence.'; COMMENT ON COLUMN "recurrence_card_charges"."recurrence_id" IS 'Card recurrence that generated the charge.'; COMMENT ON COLUMN "recurrence_card_charges"."occurrence_date" IS 'Scheduled date in the recurrence; never changes.'; COMMENT ON COLUMN "recurrence_card_charges"."date" IS 'Expected charge date while planned, purchase date once confirmed; months group by it in the purchase-date perspective.'; COMMENT ON COLUMN "recurrence_card_charges"."description" IS 'Description of the charge.'; COMMENT ON COLUMN "recurrence_card_charges"."amount" IS 'Expected amount while planned, confirmed amount once completed.'; COMMENT ON COLUMN "recurrence_card_charges"."category_id" IS 'Global or personal expense category.'; COMMENT ON COLUMN "recurrence_card_charges"."invoice_month" IS 'Reference month (first day) of the invoice the charge is expected on, or is on once confirmed.'; COMMENT ON COLUMN "recurrence_card_charges"."state" IS 'PLANNED is a projection only, COMPLETED became a purchase, CANCELED was skipped.'; COMMENT ON COLUMN "recurrence_card_charges"."canceled_at" IS 'Timestamp when the charge was skipped.'; COMMENT ON COLUMN "recurrence_card_charges"."credit_card_purchase_id" IS 'Purchase created when the charge was confirmed.'`);
        await queryRunner.query(`CREATE INDEX "idx_recurrence_card_charges_credit_card_purchase_id" ON "recurrence_card_charges"  ("credit_card_purchase_id") `);
        await queryRunner.query(`CREATE INDEX "idx_recurrence_card_charges_category_id" ON "recurrence_card_charges"  ("category_id") `);
        await queryRunner.query(`CREATE INDEX "idx_recurrence_card_charges_user_id_state" ON "recurrence_card_charges"  ("user_id", "state") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_recurrence_card_charges_occurrence" ON "recurrence_card_charges"  ("recurrence_id", "occurrence_date") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "recurrence_id" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "transactions"."recurrence_id" IS 'Recurrence that generated this transaction; null for one-time transactions.'`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "recurrence_date" date`);
        await queryRunner.query(`COMMENT ON COLUMN "transactions"."recurrence_date" IS 'Scheduled date of the occurrence in its recurrence; never changes, even when date is edited.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_transactions_recurrence_occurrence" ON "transactions"  ("recurrence_id", "recurrence_date") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "chk_transactions_recurrence" CHECK (("recurrence_id" IS NULL) = ("recurrence_date" IS NULL))`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_cf66964755c9c177cd42a47fe83" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_5dcd9b564cf83c810165a8e6d61" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_748a0a62de65013042182228103" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrences" ADD CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" ADD CONSTRAINT "FK_a2dedfa19d4cafa204e4f2e87ce" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" ADD CONSTRAINT "FK_36ae141b132c69b6fe640695026" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" ADD CONSTRAINT "FK_9b5abcdc04b46d55f0f86b9f64f" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" ADD CONSTRAINT "FK_0e6be5c0d930f2a0566d9e80420" FOREIGN KEY ("credit_card_purchase_id") REFERENCES "credit_card_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_cd584d42e98cb068bf7ae8e61cd" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_cd584d42e98cb068bf7ae8e61cd"`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" DROP CONSTRAINT "FK_0e6be5c0d930f2a0566d9e80420"`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" DROP CONSTRAINT "FK_9b5abcdc04b46d55f0f86b9f64f"`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" DROP CONSTRAINT "FK_36ae141b132c69b6fe640695026"`);
        await queryRunner.query(`ALTER TABLE "recurrence_card_charges" DROP CONSTRAINT "FK_a2dedfa19d4cafa204e4f2e87ce"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_cfd52e838e91cb1ca45c9286142"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_748a0a62de65013042182228103"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_5dcd9b564cf83c810165a8e6d61"`);
        await queryRunner.query(`ALTER TABLE "recurrences" DROP CONSTRAINT "FK_cf66964755c9c177cd42a47fe83"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "chk_transactions_recurrence"`);
        await queryRunner.query(`DROP INDEX "public"."uq_transactions_recurrence_occurrence"`);
        await queryRunner.query(`COMMENT ON COLUMN "transactions"."recurrence_date" IS 'Scheduled date of the occurrence in its recurrence; never changes, even when date is edited.'`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "recurrence_date"`);
        await queryRunner.query(`COMMENT ON COLUMN "transactions"."recurrence_id" IS 'Recurrence that generated this transaction; null for one-time transactions.'`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "recurrence_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_recurrence_card_charges_occurrence"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrence_card_charges_user_id_state"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrence_card_charges_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrence_card_charges_credit_card_purchase_id"`);
        await queryRunner.query(`DROP TABLE "recurrence_card_charges"`);
        await queryRunner.query(`DROP TYPE "public"."recurrence_card_charges_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."recurrence_card_charges_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrences_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrences_account_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrences_credit_card_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_recurrences_category_id"`);
        await queryRunner.query(`DROP TABLE "recurrences"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_frequency_enum"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."recurrences_status_enum"`);
    }

}
