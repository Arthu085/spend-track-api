import { MigrationInterface, QueryRunner } from "typeorm";

export class DescribeTokenHashesAsSha2561790943442289 implements MigrationInterface {
    name = 'DescribeTokenHashesAsSha2561790943442289'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "password_reset_tokens"."token_hash" IS 'SHA-256 hash of the password-reset token secret.'`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."token_hash" IS 'SHA-256 hash of the signed refresh token.'`);
        await queryRunner.query(`COMMENT ON COLUMN "email_confirmation_tokens"."token_hash" IS 'SHA-256 hash of the email-confirmation token secret.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "email_confirmation_tokens"."token_hash" IS 'Argon2 hash of the email-confirmation token secret.'`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."token_hash" IS 'Argon2 hash of the signed refresh token.'`);
        await queryRunner.query(`COMMENT ON COLUMN "password_reset_tokens"."token_hash" IS 'Argon2 hash of the password-reset token secret.'`);
    }

}
