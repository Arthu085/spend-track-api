import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCollapsedDashboardCardsToUserPreferences1794597391592 implements MigrationInterface {
    name = 'AddCollapsedDashboardCardsToUserPreferences1794597391592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."user_preferences_collapsed_dashboard_cards_enum" AS ENUM('OVERVIEW', 'INCOME', 'EXPENSES', 'NET_RESULT', 'BUDGET', 'UPCOMING_TRANSACTIONS', 'EXPENSES_BY_CATEGORY', 'CREDIT_CARD_INVOICES', 'INVESTMENTS', 'ACCOUNT_BALANCES')`);
        await queryRunner.query(`ALTER TABLE "user_preferences" ADD "collapsed_dashboard_cards" "public"."user_preferences_collapsed_dashboard_cards_enum" array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_preferences"."collapsed_dashboard_cards" IS 'Dashboard cards that start collapsed, showing only their title.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "user_preferences"."collapsed_dashboard_cards" IS 'Dashboard cards that start collapsed, showing only their title.'`);
        await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "collapsed_dashboard_cards"`);
        await queryRunner.query(`DROP TYPE "public"."user_preferences_collapsed_dashboard_cards_enum"`);
    }

}
