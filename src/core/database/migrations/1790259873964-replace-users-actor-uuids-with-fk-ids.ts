import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceUsersActorUuidsWithFkIds1790259873964 implements MigrationInterface {
    name = 'ReplaceUsersActorUuidsWithFkIds1790259873964'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "created_by" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."created_by" IS 'Id of the user who created this record; null for bootstrap/seeded records.'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_by" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."updated_by" IS 'Id of the user who last updated this record.'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_by" integer`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."deleted_by" IS 'Id of the user who soft-deleted this record; null while the record is active.'`);
        await queryRunner.query(`UPDATE "users" SET "created_by" = "actor"."id" FROM "users" "actor" WHERE "actor"."uuid"::text = "users"."user_created"`);
        await queryRunner.query(`UPDATE "users" SET "updated_by" = "actor"."id" FROM "users" "actor" WHERE "actor"."uuid"::text = "users"."user_updated"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "user_created"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "user_updated"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_f32b1cb14a9920477bcfd63df2c" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_b75c92ef36f432fe68ec300a7d4" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_021e2c9d9dca9f0885e8d738326" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_021e2c9d9dca9f0885e8d738326"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_b75c92ef36f432fe68ec300a7d4"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_f32b1cb14a9920477bcfd63df2c"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "user_created" character varying(64)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."user_created" IS 'Actor id who created this record; null for bootstrap/seeded records.'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "user_updated" character varying(64)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."user_updated" IS 'Actor id who last updated this record.'`);
        await queryRunner.query(`UPDATE "users" SET "user_created" = "actor"."uuid"::text FROM "users" "actor" WHERE "actor"."id" = "users"."created_by"`);
        await queryRunner.query(`UPDATE "users" SET "user_updated" = "actor"."uuid"::text FROM "users" "actor" WHERE "actor"."id" = "users"."updated_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_by"`);
    }

}
