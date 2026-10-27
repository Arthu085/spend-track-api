import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmailOutbox1791487849349 implements MigrationInterface {
    name = 'CreateEmailOutbox1791487849349'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."email_outbox_email_type_enum" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION')`);
        await queryRunner.query(`CREATE TYPE "public"."email_outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "email_outbox" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email_type" "public"."email_outbox_email_type_enum" NOT NULL, "recipient" character varying(320) NOT NULL, "locale" character varying(16) NOT NULL, "status" "public"."email_outbox_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "available_at" TIMESTAMP WITH TIME ZONE NOT NULL, "locked_until" TIMESTAMP WITH TIME ZONE, "processed_at" TIMESTAMP WITH TIME ZONE, "last_error" character varying(1000), CONSTRAINT "UQ_56b8345eba5ad899a6a2eae23f5" UNIQUE ("uuid"), CONSTRAINT "PK_b6fbfc201f705fbf1ac87bd7197" PRIMARY KEY ("id")); COMMENT ON COLUMN "email_outbox"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "email_outbox"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "email_outbox"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "email_outbox"."email_type" IS 'Which email flow this delivery job belongs to.'; COMMENT ON COLUMN "email_outbox"."recipient" IS 'Normalized recipient address. No token or link is stored: the handler mints it at delivery time.'; COMMENT ON COLUMN "email_outbox"."locale" IS 'Language of the request that scheduled the email.'; COMMENT ON COLUMN "email_outbox"."status" IS 'Delivery state: PENDING, PROCESSING, SENT, or FAILED.'; COMMENT ON COLUMN "email_outbox"."attempts" IS 'Delivery attempts started so far; also the claim fencing token.'; COMMENT ON COLUMN "email_outbox"."available_at" IS 'Earliest time a PENDING job may be claimed (retry backoff).'; COMMENT ON COLUMN "email_outbox"."locked_until" IS 'Lease expiry of a PROCESSING job; past it the job may be reclaimed.'; COMMENT ON COLUMN "email_outbox"."processed_at" IS 'When the job reached SENT or FAILED; drives retention.'; COMMENT ON COLUMN "email_outbox"."last_error" IS 'Last delivery error, with email addresses masked.'`);
        await queryRunner.query(`CREATE INDEX "idx_email_outbox_processed_at" ON "email_outbox"  ("processed_at") WHERE "processed_at" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "idx_email_outbox_processing_locked_until" ON "email_outbox"  ("locked_until") WHERE "status" = 'PROCESSING'`);
        await queryRunner.query(`CREATE INDEX "idx_email_outbox_pending_available_at" ON "email_outbox"  ("available_at") WHERE "status" = 'PENDING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_email_outbox_pending_available_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_outbox_processing_locked_until"`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_outbox_processed_at"`);
        await queryRunner.query(`DROP TABLE "email_outbox"`);
        await queryRunner.query(`DROP TYPE "public"."email_outbox_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."email_outbox_email_type_enum"`);
    }

}
