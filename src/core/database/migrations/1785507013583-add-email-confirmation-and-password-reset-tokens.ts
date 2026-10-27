import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailConfirmationAndPasswordResetTokens1785507013583 implements MigrationInterface {
    name = 'AddEmailConfirmationAndPasswordResetTokens1785507013583'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "reset_password" TO "email_confirmed_at"`);
        await queryRunner.query(`CREATE TYPE "public"."password_reset_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."password_reset_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_573c6c232c2b7d66202cbf49d87" UNIQUE ("uuid"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id")); COMMENT ON COLUMN "password_reset_tokens"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "password_reset_tokens"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "password_reset_tokens"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "password_reset_tokens"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "password_reset_tokens"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "password_reset_tokens"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "password_reset_tokens"."user_id" IS 'Owning user id.'; COMMENT ON COLUMN "password_reset_tokens"."token_hash" IS 'Argon2 hash of the password-reset token secret.'; COMMENT ON COLUMN "password_reset_tokens"."expires_at" IS 'When this password-reset token stops being usable.'; COMMENT ON COLUMN "password_reset_tokens"."consumed_at" IS 'When this password-reset token was consumed, if ever.'`);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_expires_at" ON "password_reset_tokens"  ("expires_at") `);
        await queryRunner.query(`CREATE TYPE "public"."email_confirmation_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "email_confirmation_tokens" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."email_confirmation_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_80d42e91ab00f0b50b6dae8dcb8" UNIQUE ("uuid"), CONSTRAINT "PK_194e242f0d4ca162bbac61db6d9" PRIMARY KEY ("id")); COMMENT ON COLUMN "email_confirmation_tokens"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "email_confirmation_tokens"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "email_confirmation_tokens"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "email_confirmation_tokens"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "email_confirmation_tokens"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "email_confirmation_tokens"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "email_confirmation_tokens"."user_id" IS 'Owning user id.'; COMMENT ON COLUMN "email_confirmation_tokens"."token_hash" IS 'Argon2 hash of the email-confirmation token secret.'; COMMENT ON COLUMN "email_confirmation_tokens"."expires_at" IS 'When this email-confirmation token stops being usable.'; COMMENT ON COLUMN "email_confirmation_tokens"."consumed_at" IS 'When this email-confirmation token was consumed, if ever.'`);
        await queryRunner.query(`CREATE INDEX "idx_email_confirmation_tokens_user_id" ON "email_confirmation_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_email_confirmation_tokens_expires_at" ON "email_confirmation_tokens"  ("expires_at") `);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_confirmed_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email_confirmed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."email_confirmed_at" IS 'When the user confirmed ownership of their email; null until then.'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" ADD CONSTRAINT "FK_6e2b5b40ef81c7218145ece444e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmation_tokens" DROP CONSTRAINT "FK_6e2b5b40ef81c7218145ece444e"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."email_confirmed_at" IS 'When the user confirmed ownership of their email; null until then.'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_confirmed_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email_confirmed_at" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_confirmation_tokens_expires_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_confirmation_tokens_user_id"`);
        await queryRunner.query(`DROP TABLE "email_confirmation_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."email_confirmation_tokens_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_expires_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_user_id"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."password_reset_tokens_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "email_confirmed_at" TO "reset_password"`);
    }

}
