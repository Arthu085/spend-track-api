import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleAbilityEntity1776300879873 implements MigrationInterface {
    name = 'AddRoleAbilityEntity1776300879873'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."role_abilities_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "role_abilities" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "status" "public"."role_abilities_status_enum" NOT NULL DEFAULT 'ACTIVE', "role_id" integer, "ability_id" integer, CONSTRAINT "UQ_6dea067fc4e5e71e9ae95ed89a2" UNIQUE ("uuid"), CONSTRAINT "UQ_07ad485e5ab2b34534cc978ca64" UNIQUE ("role_id", "ability_id"), CONSTRAINT "PK_5f4f7dd9abe898b479e8c98b064" PRIMARY KEY ("id")); COMMENT ON COLUMN "role_abilities"."id" IS 'Identificador único da entidade'; COMMENT ON COLUMN "role_abilities"."uuid" IS 'Identificador único da entidade no formato UUID'; COMMENT ON COLUMN "role_abilities"."created_at" IS 'Data de criação da entidade'; COMMENT ON COLUMN "role_abilities"."updated_at" IS 'Data de atualização da entidade'; COMMENT ON COLUMN "role_abilities"."deleted_at" IS 'Data de exclusão da entidade'; COMMENT ON COLUMN "role_abilities"."status" IS 'Status da entidade'; COMMENT ON COLUMN "role_abilities"."role_id" IS 'Identificador único da entidade'; COMMENT ON COLUMN "role_abilities"."ability_id" IS 'Identificador único da entidade'`);
        await queryRunner.query(`CREATE INDEX "IDX_6dea067fc4e5e71e9ae95ed89a" ON "role_abilities" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_3e7e23d099fcaf78c6f4c147ac" ON "role_abilities" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_1e8a9df86d8adbd9e20a6a0101" ON "role_abilities" ("role_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_285ea6ef85f557217e3c564646" ON "role_abilities" ("ability_id") `);
        await queryRunner.query(`COMMENT ON TABLE "role_abilities" IS 'Tabela de associação entre funções e permissões'`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ADD CONSTRAINT "FK_1e8a9df86d8adbd9e20a6a0101f" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ADD CONSTRAINT "FK_285ea6ef85f557217e3c564646e" FOREIGN KEY ("ability_id") REFERENCES "abilities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_abilities" DROP CONSTRAINT "FK_285ea6ef85f557217e3c564646e"`);
        await queryRunner.query(`ALTER TABLE "role_abilities" DROP CONSTRAINT "FK_1e8a9df86d8adbd9e20a6a0101f"`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`COMMENT ON TABLE "role_abilities" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_285ea6ef85f557217e3c564646"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1e8a9df86d8adbd9e20a6a0101"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3e7e23d099fcaf78c6f4c147ac"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6dea067fc4e5e71e9ae95ed89a"`);
        await queryRunner.query(`DROP TABLE "role_abilities"`);
        await queryRunner.query(`DROP TYPE "public"."role_abilities_status_enum"`);
    }

}
