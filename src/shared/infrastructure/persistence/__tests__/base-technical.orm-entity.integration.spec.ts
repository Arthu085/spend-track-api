import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';

const TECHNICAL_TABLES = [
  'audit_logs',
  'email_send_logs',
  'refresh_tokens',
  'password_reset_tokens',
  'email_confirmation_tokens',
];

describe('BaseTechnicalOrmEntity tables (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreConfigModule, DatabaseModule],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it.each(TECHNICAL_TABLES)(
    'migrated %s to the lean base columns',
    async (table) => {
      const columns: Array<{ column_name: string }> = await dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [table],
      );

      const columnNames = columns.map((column) => column.column_name);

      expect(columnNames).toEqual(
        expect.arrayContaining(['id', 'uuid', 'created_at']),
      );
      expect(columnNames).not.toContain('status');
      expect(columnNames).not.toContain('updated_at');
      expect(columnNames).not.toContain('deleted_at');
    },
  );
});
