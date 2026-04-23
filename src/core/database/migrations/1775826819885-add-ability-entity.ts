import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAbilityEntity1775826819885 implements MigrationInterface {
    name = 'AddAbilityEntity1775826819885'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."abilities_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_action_enum" AS ENUM('CREATE', 'READ', 'UPDATE', 'DELETE')`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_subject_enum" AS ENUM('ROLE')`);
        await queryRunner.query(`CREATE TABLE "abilities" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "status" "public"."abilities_status_enum" NOT NULL DEFAULT 'ACTIVE', "action" "public"."abilities_action_enum" NOT NULL, "subject" "public"."abilities_subject_enum" NOT NULL, CONSTRAINT "UQ_1a080b1f5b714dd0a95dff2566f" UNIQUE ("uuid"), CONSTRAINT "UQ_2897c460d91c5b85efda92c0399" UNIQUE ("action", "subject"), CONSTRAINT "PK_8cd72b52f6374bf02333abf365a" PRIMARY KEY ("id")); COMMENT ON COLUMN "abilities"."id" IS 'Identificador único da entidade'; COMMENT ON COLUMN "abilities"."uuid" IS 'Identificador único da entidade no formato UUID'; COMMENT ON COLUMN "abilities"."created_at" IS 'Data de criação da entidade'; COMMENT ON COLUMN "abilities"."updated_at" IS 'Data de atualização da entidade'; COMMENT ON COLUMN "abilities"."deleted_at" IS 'Data de exclusão da entidade'; COMMENT ON COLUMN "abilities"."status" IS 'Status da entidade'; COMMENT ON COLUMN "abilities"."action" IS 'Ação da permissão (CREATE, READ, etc)'; COMMENT ON COLUMN "abilities"."subject" IS 'Recurso da permissão (USER, ROLE, etc)'`);
        await queryRunner.query(`CREATE INDEX "IDX_1a080b1f5b714dd0a95dff2566" ON "abilities" ("uuid") `);
        await queryRunner.query(`CREATE INDEX "IDX_3b480fd201fd889befa5320604" ON "abilities" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_407acab68367a9ac11ab79e99d" ON "abilities" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_98b197f8d993406c5321b7f6a6" ON "abilities" ("subject") `);
        await queryRunner.query(`COMMENT ON TABLE "abilities" IS 'Tabela para armazenar as permissões dos usuários'`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`COMMENT ON TABLE "abilities" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98b197f8d993406c5321b7f6a6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_407acab68367a9ac11ab79e99d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b480fd201fd889befa5320604"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1a080b1f5b714dd0a95dff2566"`);
        await queryRunner.query(`DROP TABLE "abilities"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_subject_enum"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_action_enum"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_status_enum"`);
    }

}
