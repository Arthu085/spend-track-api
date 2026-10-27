import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRefreshTokensTable1785019615257 implements MigrationInterface {
    name = 'CreateRefreshTokensTable1785019615257'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."refresh_tokens_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."refresh_tokens_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_uuid" uuid, CONSTRAINT "UQ_fe3de112a4f7fd559c1d5795099" UNIQUE ("uuid"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")); COMMENT ON COLUMN "refresh_tokens"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "refresh_tokens"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "refresh_tokens"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "refresh_tokens"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "refresh_tokens"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "refresh_tokens"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "refresh_tokens"."user_id" IS 'Owning user id.'; COMMENT ON COLUMN "refresh_tokens"."token_hash" IS 'Argon2 hash of the signed refresh token.'; COMMENT ON COLUMN "refresh_tokens"."expires_at" IS 'When this refresh token stops being usable.'; COMMENT ON COLUMN "refresh_tokens"."revoked_at" IS 'When this refresh token was revoked (rotation or logout).'; COMMENT ON COLUMN "refresh_tokens"."replaced_by_uuid" IS 'uuid of the refresh token row that replaced this one, if any.'`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens"  ("expires_at") `);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_expires_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user_id"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."refresh_tokens_status_enum"`);
    }

}
