import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserHashRefreshToken1779129436607 implements MigrationInterface {
    name = 'AddUserHashRefreshToken1779129436607'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "hashed_refresh_token" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."hashed_refresh_token" IS 'Token de refresh (armazenado com hash) para validação de sessões'`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."role_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."role_id" IS 'Identificador único da entidade'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."hashed_refresh_token" IS 'Token de refresh (armazenado com hash) para validação de sessões'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "hashed_refresh_token"`);
    }

}
