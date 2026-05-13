import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserSujectEnum1777736958938 implements MigrationInterface {
    name = 'AddUserSujectEnum1777736958938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "abilities" DROP CONSTRAINT "UQ_2897c460d91c5b85efda92c0399"`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TYPE "public"."abilities_subject_enum" RENAME TO "abilities_subject_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_subject_enum" AS ENUM('ROLE', 'USER')`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "subject" TYPE "public"."abilities_subject_enum" USING "subject"::"text"::"public"."abilities_subject_enum"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_subject_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "abilities" ADD CONSTRAINT "UQ_2897c460d91c5b85efda92c0399" UNIQUE ("action", "subject")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "abilities" DROP CONSTRAINT "UQ_2897c460d91c5b85efda92c0399"`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "role_abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`CREATE TYPE "public"."abilities_subject_enum_old" AS ENUM('ROLE')`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "subject" TYPE "public"."abilities_subject_enum_old" USING "subject"::"text"::"public"."abilities_subject_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."abilities_subject_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."abilities_subject_enum_old" RENAME TO "abilities_subject_enum"`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "abilities" ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "abilities" ADD CONSTRAINT "UQ_2897c460d91c5b85efda92c0399" UNIQUE ("action", "subject")`);
    }

}
