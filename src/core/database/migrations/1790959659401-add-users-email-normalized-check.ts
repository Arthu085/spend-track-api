import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUsersEmailNormalizedCheck1790959659401 implements MigrationInterface {
    name = 'AddUsersEmailNormalizedCheck1790959659401'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "users"."email" IS 'Unique login email, stored normalized (trimmed, lowercased).'`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "chk_users_email_normalized" CHECK ("email" = lower(btrim("email")))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_email_normalized"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."email" IS 'Unique login email.'`);
    }

}
