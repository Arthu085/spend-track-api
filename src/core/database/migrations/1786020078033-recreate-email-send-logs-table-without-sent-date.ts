import { MigrationInterface, QueryRunner } from "typeorm";

export class RecreateEmailSendLogsTableWithoutSentDate1786020078033 implements MigrationInterface {
    name = 'RecreateEmailSendLogsTableWithoutSentDate1786020078033'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."email_send_logs_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."email_send_logs_email_type_enum" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION')`);
        await queryRunner.query(`CREATE TABLE "email_send_logs" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."email_send_logs_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "email_type" "public"."email_send_logs_email_type_enum" NOT NULL, "recipient" character varying(320) NOT NULL, CONSTRAINT "UQ_7fbc72e76f9e0ce2b7794602e42" UNIQUE ("uuid"), CONSTRAINT "PK_d4e59e3bd1bbd5c4f07875c82ff" PRIMARY KEY ("id")); COMMENT ON COLUMN "email_send_logs"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "email_send_logs"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "email_send_logs"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "email_send_logs"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "email_send_logs"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "email_send_logs"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "email_send_logs"."email_type" IS 'Which email flow this send attempt belongs to.'; COMMENT ON COLUMN "email_send_logs"."recipient" IS 'Normalized (trimmed, lowercased) recipient address the quota is keyed on.'`);
        await queryRunner.query(`CREATE INDEX "idx_email_send_logs_type_recipient_created_at" ON "email_send_logs"  ("email_type", "recipient", "created_at") `);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_send_logs_type_recipient_created_at"`);
        await queryRunner.query(`DROP TABLE "email_send_logs"`);
        await queryRunner.query(`DROP TYPE "public"."email_send_logs_email_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."email_send_logs_status_enum"`);
    }

}
