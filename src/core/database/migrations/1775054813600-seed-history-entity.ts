import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedHistoryEntity1775054813600 implements MigrationInterface {
    name = 'SeedHistoryEntity1775054813600'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "seed_history" ("id" SERIAL NOT NULL, "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "executed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_0687f21614ff5556f3d6d88ec1f" UNIQUE ("uuid"), CONSTRAINT "UQ_3593e1c2b96d3b0a2d31cafba11" UNIQUE ("name"), CONSTRAINT "PK_9a24c20ee229927ee9b92baf4f9" PRIMARY KEY ("id")); COMMENT ON COLUMN "seed_history"."id" IS 'Unique identifier of the seed history record'; COMMENT ON COLUMN "seed_history"."uuid" IS 'Unique identifier of the entity in UUID format'; COMMENT ON COLUMN "seed_history"."name" IS 'Name of the executed seed'; COMMENT ON COLUMN "seed_history"."executed_at" IS 'Date of execution of the seed'`);
        await queryRunner.query(`COMMENT ON TABLE "seed_history" IS 'Table for storing the history of executed seeds'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON TABLE "seed_history" IS NULL`);
        await queryRunner.query(`DROP TABLE "seed_history"`);
    }

}
