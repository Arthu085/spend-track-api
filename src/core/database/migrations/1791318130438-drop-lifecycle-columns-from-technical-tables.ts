import { MigrationInterface, QueryRunner } from "typeorm";

export class DropLifecycleColumnsFromTechnicalTables1791318130438 implements MigrationInterface {
    name = 'DropLifecycleColumnsFromTechnicalTables1791318130438'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_status_enum"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."refresh_tokens_status_enum"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."password_reset_tokens_status_enum"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."email_send_logs_status_enum"`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."email_confirmation_tokens_status_enum"`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" DROP COLUMN "deleted_at"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE TYPE "public"."email_confirmation_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ADD "status" "public"."email_confirmation_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE TYPE "public"."email_send_logs_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" ADD "status" "public"."email_send_logs_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE TYPE "public"."password_reset_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD "status" "public"."password_reset_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE TYPE "public"."refresh_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "status" "public"."refresh_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "status" "public"."audit_logs_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
    }

}
