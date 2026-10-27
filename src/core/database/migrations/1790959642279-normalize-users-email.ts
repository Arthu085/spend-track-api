import { MigrationInterface, QueryRunner } from "typeorm";

export class NormalizeUsersEmail1790959642279 implements MigrationInterface {
    name = 'NormalizeUsersEmail1790959642279'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const conflicts: { uuids: string[] }[] = await queryRunner.query(
            `SELECT array_agg("uuid"::text ORDER BY "id") AS "uuids" FROM "users" WHERE "deleted_at" IS NULL GROUP BY lower(btrim("email")) HAVING count(*) > 1`,
        );

        if (conflicts.length > 0) {
            const groups = conflicts.map((conflict) => `[${conflict.uuids.join(', ')}]`).join('; ');
            throw new Error(
                `Cannot normalize users.email: active users share an email that differs only by case or surrounding whitespace. Resolve these user uuid groups (change the email or soft-delete all but one per group), then rerun the migration: ${groups}`,
            );
        }

        await queryRunner.query(`UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"))`);
    }

    public async down(): Promise<void> {
        // Original email casing is not recoverable; normalized values stay in place.
    }

}
