import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserChangeRequests1791755363734 implements MigrationInterface {
    name = 'CreateUserChangeRequests1791755363734'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."user_change_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')`);
        await queryRunner.query(`CREATE TABLE "user_change_requests" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "target_user_id" integer NOT NULL, "requested_by" integer, "status" "public"."user_change_requests_status_enum" NOT NULL, "current_name" character varying(150) NOT NULL, "current_email" character varying(255) NOT NULL, "requested_name" character varying(150) NOT NULL, "requested_email" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "decided_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_b471eabcd6404774e6d3d99ce05" UNIQUE ("uuid"), CONSTRAINT "PK_3dcfdd8fa51729d521726e569e1" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_change_requests"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "user_change_requests"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "user_change_requests"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "user_change_requests"."target_user_id" IS 'Admin whose profile the request changes and who must approve it.'; COMMENT ON COLUMN "user_change_requests"."requested_by" IS 'Admin who requested the change; null once that user is removed.'; COMMENT ON COLUMN "user_change_requests"."status" IS 'PENDING until the target approves or rejects it, or a newer request supersedes it.'; COMMENT ON COLUMN "user_change_requests"."current_name" IS 'Target name when the request was made.'; COMMENT ON COLUMN "user_change_requests"."current_email" IS 'Target email when the request was made.'; COMMENT ON COLUMN "user_change_requests"."requested_name" IS 'Name applied on approval.'; COMMENT ON COLUMN "user_change_requests"."requested_email" IS 'Normalized email applied on approval.'; COMMENT ON COLUMN "user_change_requests"."expires_at" IS 'When this request can no longer be approved.'; COMMENT ON COLUMN "user_change_requests"."decided_at" IS 'When the request left PENDING, if ever.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_change_requests_pending_target" ON "user_change_requests"  ("target_user_id") WHERE "status" = 'PENDING'`);
        await queryRunner.query(`CREATE TABLE "user_change_request_current_roles" ("change_request_id" integer NOT NULL, "role_id" integer NOT NULL, CONSTRAINT "PK_97290e4faf3dd4148d622c4eb11" PRIMARY KEY ("change_request_id", "role_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b317ea2ffefc2a3775a3ed5ff4" ON "user_change_request_current_roles"  ("change_request_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_72794e350cc0058736ce82221f" ON "user_change_request_current_roles"  ("role_id") `);
        await queryRunner.query(`CREATE TABLE "user_change_request_requested_roles" ("change_request_id" integer NOT NULL, "role_id" integer NOT NULL, CONSTRAINT "PK_54ed81429f947284f32e5af5415" PRIMARY KEY ("change_request_id", "role_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_97091da422c0321dc6d80a223e" ON "user_change_request_requested_roles"  ("change_request_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_8ea549d24de39c73a77636b00d" ON "user_change_request_requested_roles"  ("role_id") `);
        await queryRunner.query(`ALTER TYPE "public"."email_outbox_email_type_enum" ADD VALUE 'USER_CHANGE_REQUEST'`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_send_logs_type_recipient_created_at"`);
        await queryRunner.query(`ALTER TYPE "public"."email_send_logs_email_type_enum" ADD VALUE 'USER_CHANGE_REQUEST'`);
        await queryRunner.query(`CREATE INDEX "idx_email_send_logs_type_recipient_created_at" ON "email_send_logs"  ("email_type", "recipient", "created_at") `);
        await queryRunner.query(`ALTER TABLE "user_change_requests" ADD CONSTRAINT "FK_baa92a5a0e7f4340061b1c5174a" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_change_requests" ADD CONSTRAINT "FK_75b3f400172c0982ecc5336084f" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_change_request_current_roles" ADD CONSTRAINT "FK_b317ea2ffefc2a3775a3ed5ff47" FOREIGN KEY ("change_request_id") REFERENCES "user_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_change_request_current_roles" ADD CONSTRAINT "FK_72794e350cc0058736ce82221fd" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_change_request_requested_roles" ADD CONSTRAINT "FK_97091da422c0321dc6d80a223e5" FOREIGN KEY ("change_request_id") REFERENCES "user_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_change_request_requested_roles" ADD CONSTRAINT "FK_8ea549d24de39c73a77636b00df" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_change_request_requested_roles" DROP CONSTRAINT "FK_8ea549d24de39c73a77636b00df"`);
        await queryRunner.query(`ALTER TABLE "user_change_request_requested_roles" DROP CONSTRAINT "FK_97091da422c0321dc6d80a223e5"`);
        await queryRunner.query(`ALTER TABLE "user_change_request_current_roles" DROP CONSTRAINT "FK_72794e350cc0058736ce82221fd"`);
        await queryRunner.query(`ALTER TABLE "user_change_request_current_roles" DROP CONSTRAINT "FK_b317ea2ffefc2a3775a3ed5ff47"`);
        await queryRunner.query(`ALTER TABLE "user_change_requests" DROP CONSTRAINT "FK_75b3f400172c0982ecc5336084f"`);
        await queryRunner.query(`ALTER TABLE "user_change_requests" DROP CONSTRAINT "FK_baa92a5a0e7f4340061b1c5174a"`);
        await queryRunner.query(`DROP INDEX "public"."idx_email_send_logs_type_recipient_created_at"`);
        await queryRunner.query(`CREATE TYPE "public"."email_send_logs_email_type_enum_old" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION')`);
        await queryRunner.query(`ALTER TABLE "email_send_logs" ALTER COLUMN "email_type" TYPE "public"."email_send_logs_email_type_enum_old" USING "email_type"::"text"::"public"."email_send_logs_email_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_send_logs_email_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_send_logs_email_type_enum_old" RENAME TO "email_send_logs_email_type_enum"`);
        await queryRunner.query(`CREATE INDEX "idx_email_send_logs_type_recipient_created_at" ON "email_send_logs" USING btree ("created_at", "email_type", "recipient") `);
        await queryRunner.query(`CREATE TYPE "public"."email_outbox_email_type_enum_old" AS ENUM('PASSWORD_RESET', 'EMAIL_CONFIRMATION')`);
        await queryRunner.query(`ALTER TABLE "email_outbox" ALTER COLUMN "email_type" TYPE "public"."email_outbox_email_type_enum_old" USING "email_type"::"text"::"public"."email_outbox_email_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."email_outbox_email_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."email_outbox_email_type_enum_old" RENAME TO "email_outbox_email_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8ea549d24de39c73a77636b00d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97091da422c0321dc6d80a223e"`);
        await queryRunner.query(`DROP TABLE "user_change_request_requested_roles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_72794e350cc0058736ce82221f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b317ea2ffefc2a3775a3ed5ff4"`);
        await queryRunner.query(`DROP TABLE "user_change_request_current_roles"`);
        await queryRunner.query(`DROP INDEX "public"."uq_user_change_requests_pending_target"`);
        await queryRunner.query(`DROP TABLE "user_change_requests"`);
        await queryRunner.query(`DROP TYPE "public"."user_change_requests_status_enum"`);
    }

}
