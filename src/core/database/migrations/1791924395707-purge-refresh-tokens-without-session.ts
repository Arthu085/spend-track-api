import { MigrationInterface, QueryRunner } from "typeorm";

export class PurgeRefreshTokensWithoutSession1791924395707 implements MigrationInterface {
    name = 'PurgeRefreshTokensWithoutSession1791924395707'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The next migration adds a required session_id. Existing rows never stored the session their
        // JWT carries, so they cannot be backfilled; deleting them signs every user out once.
        await queryRunner.query(`DELETE FROM "refresh_tokens"`);
    }

    public async down(): Promise<void> {
        // Deleted tokens are not recoverable; their users sign in again.
    }

}
