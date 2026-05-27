import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveAndAddIndex1779892400119 implements MigrationInterface {
    name = 'RemoveAndAddIndex1779892400119'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1a080b1f5b714dd0a95dff2566"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6dea067fc4e5e71e9ae95ed89a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cdc7776894e484eaed828ca061"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_951b8f1dfc94ac1d0301a14b7e"`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`CREATE INDEX "IDX_499464ab5a8d3ec439d00c3456" ON "abilities" ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_58181b00dc3a75ba2aff2d2522" ON "role_abilities" ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_7fd0c79dc4e6083ddea850ac38" ON "roles" ("deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_073999dfec9d14522f0cf58cd6" ON "users" ("deleted_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_073999dfec9d14522f0cf58cd6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7fd0c79dc4e6083ddea850ac38"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_58181b00dc3a75ba2aff2d2522"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_499464ab5a8d3ec439d00c3456"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`CREATE INDEX "IDX_951b8f1dfc94ac1d0301a14b7e" ON "users" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_cdc7776894e484eaed828ca061" ON "roles" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_6dea067fc4e5e71e9ae95ed89a" ON "role_abilities" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_1a080b1f5b714dd0a95dff2566" ON "abilities" ("uuid") `);
    }

}
