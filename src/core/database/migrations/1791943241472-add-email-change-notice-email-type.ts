import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailChangeNoticeEmailType1791943241472 implements MigrationInterface {
    name = 'AddEmailChangeNoticeEmailType1791943241472'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_email_send_logs_type_recipient_created_at"`);
        await queryRunner.query(`ALTER TYPE "public"."email_send_logs_email_type_enum" ADD VALUE 'EMAIL_CHANGE_NOTICE'`);
        await queryRunner.query(`ALTER TYPE "public"."email_outbox_email_type_enum" ADD VALUE 'EMAIL_CHANGE_NOTICE'`);
        await queryRunner.query(`CREATE INDEX "idx_email_send_logs_type_recipient_created_at" ON "email_send_logs"  ("email_type", "recipient", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_email_send_logs_type_recipient_created_at"`);
        await queryRunner.query(`CREATE TYPE "public"."email_outbox_email_type_enum_old" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION', 'USER_CHANGE_REQUEST')`);
        await queryRunner.query(`ALTER TABLE "email_outbox" ALTER COLUMN "email_type" TYPE "public"."email_outbox_email_type_enum_old" USING "email_type"::"text"::"public"."email_outbox_email_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_outbox_email_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_outbox_email_type_enum_old" RENAME TO "email_outbox_email_type_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."email_send_logs_email_type_enum_old" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION', 'USER_CHANGE_REQUEST')`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" ALTER COLUMN "email_type" TYPE "public"."email_send_logs_email_type_enum_old" USING "email_type"::"text"::"public"."email_send_logs_email_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_send_logs_email_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_send_logs_email_type_enum_old" RENAME TO "email_send_logs_email_type_enum"`);
        await queryRunner.query(`CREATE INDEX "idx_email_send_logs_type_recipient_created_at" ON "email_send_logs" USING btree ("created_at", "email_type", "recipient") `);
    }

}
