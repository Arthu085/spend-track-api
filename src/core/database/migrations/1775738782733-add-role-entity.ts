import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleEntity1775738782733 implements MigrationInterface {
    name = 'AddRoleEntity1775738782733'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."roles_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."roles_name_enum" AS ENUM('ADMIN', 'USER')`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "status" "public"."roles_status_enum" NOT NULL DEFAULT 'ACTIVE', "name" "public"."roles_name_enum" NOT NULL, CONSTRAINT "UQ_cdc7776894e484eaed828ca0616" UNIQUE ("uuid"), CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id")); COMMENT ON COLUMN "roles"."id" IS 'Identificador único da entidade'; COMMENT ON COLUMN "roles"."uuid" IS 'Identificador único da entidade no formato UUID'; COMMENT ON COLUMN "roles"."created_at" IS 'Data de criação da entidade'; COMMENT ON COLUMN "roles"."updated_at" IS 'Data de atualização da entidade'; COMMENT ON COLUMN "roles"."deleted_at" IS 'Data de exclusão da entidade'; COMMENT ON COLUMN "roles"."status" IS 'Status da entidade'; COMMENT ON COLUMN "roles"."name" IS 'Nome da função'`);
        await queryRunner.query(`CREATE INDEX "IDX_cdc7776894e484eaed828ca061" ON "roles" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_14958a120176d4e1e8be423977" ON "roles" ("status") `);
        await queryRunner.query(`COMMENT ON TABLE "roles" IS 'Tabela de funções do sistema'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON TABLE "roles" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_14958a120176d4e1e8be423977"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cdc7776894e484eaed828ca061"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TYPE "public"."roles_name_enum"`);
        await queryRunner.query(`DROP TYPE "public"."roles_status_enum"`);
    }

}
