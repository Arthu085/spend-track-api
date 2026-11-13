import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDashboardCardsVisibleToUserPreferences1794595246159 implements MigrationInterface {
    name = 'AddDashboardCardsVisibleToUserPreferences1794595246159'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_preferences" ADD "dashboard_cards_visible" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "user_preferences"."dashboard_cards_visible" IS 'Whether the dashboard opens with its card section shown.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "user_preferences"."dashboard_cards_visible" IS 'Whether the dashboard opens with its card section shown.'`);
        await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "dashboard_cards_visible"`);
    }

}
