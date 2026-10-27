import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRolesTable1784811385170 implements MigrationInterface {
    name = 'CreateRolesTable1784811385170'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."roles_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."roles_name_enum" AS ENUM('ADMIN', 'USER')`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."roles_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" "public"."roles_name_enum" NOT NULL, CONSTRAINT "UQ_cdc7776894e484eaed828ca0616" UNIQUE ("uuid"), CONSTRAINT "UQ_roles_name" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id")); COMMENT ON COLUMN "roles"."id" IS 'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.'; COMMENT ON COLUMN "roles"."uuid" IS 'Public identifier exposed to clients instead of the numeric id.'; COMMENT ON COLUMN "roles"."status" IS 'Lifecycle status of the record.'; COMMENT ON COLUMN "roles"."created_at" IS 'Timestamp when the record was created.'; COMMENT ON COLUMN "roles"."updated_at" IS 'Timestamp when the record was last updated.'; COMMENT ON COLUMN "roles"."deleted_at" IS 'Timestamp when the record was soft-deleted; null while the record is active.'; COMMENT ON COLUMN "roles"."name" IS 'Stable code-defined role identifier (RoleKey enum).'`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TYPE "public"."roles_name_enum"`);
        await queryRunner.query(`DROP TYPE "public"."roles_status_enum"`);
    }

}
