import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthorizationJoinTables1784811482119 implements MigrationInterface {
    name = 'CreateAuthorizationJoinTables1784811482119'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "role_abilities" ("role_id" integer NOT NULL, "ability_id" integer NOT NULL, CONSTRAINT "PK_07ad485e5ab2b34534cc978ca64" PRIMARY KEY ("role_id", "ability_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1e8a9df86d8adbd9e20a6a0101" ON "role_abilities"  ("role_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_285ea6ef85f557217e3c564646" ON "role_abilities"  ("ability_id") `);
        await queryRunner.query(`CREATE TABLE "user_roles" ("user_id" integer NOT NULL, "role_id" integer NOT NULL, CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b23c65e50a758245a33ee35fda" ON "user_roles"  ("role_id") `);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ADD CONSTRAINT "FK_1e8a9df86d8adbd9e20a6a0101f" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ADD CONSTRAINT "FK_285ea6ef85f557217e3c564646e" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"`);
        await queryRunner.query(`ALTER TABLE "role_abilities" DROP CONSTRAINT "FK_285ea6ef85f557217e3c564646e"`);
        await queryRunner.query(`ALTER TABLE "role_abilities" DROP CONSTRAINT "FK_1e8a9df86d8adbd9e20a6a0101f"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT gen_random_uuid()`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b23c65e50a758245a33ee35fda"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87b8888186ca9769c960e92687"`);
        await queryRunner.query(`DROP TABLE "user_roles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_285ea6ef85f557217e3c564646"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1e8a9df86d8adbd9e20a6a0101"`);
        await queryRunner.query(`DROP TABLE "role_abilities"`);
    }

}
