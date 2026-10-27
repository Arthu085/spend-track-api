import { MigrationInterface, QueryRunner } from "typeorm";

const TOKEN_TABLES = ["refresh_tokens", "password_reset_tokens", "email_confirmation_tokens"];

export class PurgeLifecycleFlaggedTokenRows1791318112706 implements MigrationInterface {
    name = 'PurgeLifecycleFlaggedTokenRows1791318112706'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The next migration drops status and deleted_at from the token tables; tokens disabled through
        // those flags are deleted first so they cannot become usable again once the flags are gone.
        for (const table of TOKEN_TABLES) {
            await queryRunner.query(`DELETE FROM "${table}" WHERE "deleted_at" IS NOT NULL OR "status" <> 'ACTIVE'`);
        }
    }

    public async down(): Promise<void> {
        // Deleted tokens are not recoverable; they were already unusable.
    }

}
