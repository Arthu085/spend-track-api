import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogsTable1784727150257 implements MigrationInterface {
    name = 'CreateAuditLogsTable1784727150257'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_outcome_enum" AS ENUM('SUCCESS', 'FAILURE')`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."audit_logs_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" character varying(64), "action" character varying(120) NOT NULL, "method" character varying(10) NOT NULL, "path" text NOT NULL, "outcome" "public"."audit_logs_outcome_enum" NOT NULL, "status_code" integer NOT NULL, "context" jsonb, "error_message" text, CONSTRAINT "UQ_809d3a75a6776bfecf54c8aab35" UNIQUE ("uuid"), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")); COMMENT ON COLUMN "audit_logs"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "audit_logs"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "audit_logs"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "audit_logs"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "audit_logs"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "audit_logs"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "audit_logs"."user_id" IS 'Authenticated actor id (JWT subject), null when unauthenticated or unavailable.'; COMMENT ON COLUMN "audit_logs"."action" IS 'Audited action identifier declared via endpoint().audit(...), e.g. "User.update".'; COMMENT ON COLUMN "audit_logs"."method" IS 'HTTP method of the audited request.'; COMMENT ON COLUMN "audit_logs"."path" IS 'HTTP path of the audited request.'; COMMENT ON COLUMN "audit_logs"."outcome" IS 'Whether the audited request succeeded or failed.'; COMMENT ON COLUMN "audit_logs"."status_code" IS 'Resulting HTTP status code.'; COMMENT ON COLUMN "audit_logs"."context" IS 'Request metadata (ip, user agent, request id).'; COMMENT ON COLUMN "audit_logs"."error_message" IS 'Error message when outcome is FAILURE; never a stack trace or sensitive data.'`);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_outcome" ON "audit_logs"  ("outcome") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_action" ON "audit_logs"  ("action") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"  ("created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_action"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_outcome"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_outcome_enum"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_status_enum"`);
    }

}
