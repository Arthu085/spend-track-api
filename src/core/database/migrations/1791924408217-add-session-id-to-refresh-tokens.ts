import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionIdToRefreshTokens1791924408217 implements MigrationInterface {
    name = 'AddSessionIdToRefreshTokens1791924408217'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "session_id" uuid NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."session_id" IS 'Session id (sid claim) shared by every token rotated from one login.'`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_session_id" ON "refresh_tokens"  ("session_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_session_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."session_id" IS 'Session id (sid claim) shared by every token rotated from one login.'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "session_id"`);
    }

}
