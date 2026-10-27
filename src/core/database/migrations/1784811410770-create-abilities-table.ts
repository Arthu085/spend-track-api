import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAbilitiesTable1784811410770 implements MigrationInterface {
    name = 'CreateAbilitiesTable1784811410770'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."abilities_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_action_enum" AS ENUM('CREATE', 'READ', 'UPDATE', 'DELETE')`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_subject_enum" AS ENUM('USER', 'ROLE', 'ABILITY')`);
        await queryRunner.query(`CREATE TABLE "abilities" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."abilities_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "action" "public"."abilities_action_enum" NOT NULL, "subject" "public"."abilities_subject_enum" NOT NULL, CONSTRAINT "UQ_1a080b1f5b714dd0a95dff2566f" UNIQUE ("uuid"), CONSTRAINT "PK_8cd72b52f6374bf02333abf365a" PRIMARY KEY ("id")); COMMENT ON COLUMN "abilities"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "abilities"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "abilities"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "abilities"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "abilities"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "abilities"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "abilities"."action" IS 'Action half of the fixed (Action, Subject) ability pair.'; COMMENT ON COLUMN "abilities"."subject" IS 'Subject half of the fixed (Action, Subject) ability pair.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_abilities_action_subject" ON "abilities"  ("action", "subject") `);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP INDEX "public"."uq_abilities_action_subject"`);
        await queryRunner.query(`DROP TABLE "abilities"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_subject_enum"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_action_enum"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_status_enum"`);
    }

}
