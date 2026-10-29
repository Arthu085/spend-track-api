import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  ADMIN_CREDENTIALS,
  type AuthAgent,
  createAuthAgent,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface EnvelopeBody<T> {
  data: T;
}

interface AccountShape {
  uuid: string;
  name: string;
  isDefault: boolean;
  openingBalance: string;
  currentBalance: string;
  status: string;
}

interface CategoryShape {
  uuid: string;
  name: string;
  scope: string;
  kind: string;
}

interface DashboardShape {
  period: { year: number; month: number; timing: string };
  perspective: string;
  balances: { actual: string; projected: string };
  accounts: Array<{ uuid: string; actualBalance: string }>;
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

// Financial data belongs to its owner only. The admin here holds every
// ability, which must not grant any access to another user's finances.
describe('Financial data ownership (e2e)', () => {
  let app: INestApplication<App>;
  let owner: AuthAgent;
  let admin: AuthAgent;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await createAuthAgent(app, await createIsolatedUser(app));
    admin = await createAuthAgent(app, ADMIN_CREDENTIALS);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAccount(
    agent: AuthAgent,
    body: Record<string, unknown>,
  ): Promise<AccountShape> {
    const response = await agent
      .post('/api/accounts')
      .send({
        type: 'CHECKING',
        openingBalanceDate: '2026-10-01',
        ...body,
      })
      .expect(201);

    return dataOf<AccountShape>(response.body);
  }

  describe('accounts', () => {
    let ownerAccount: AccountShape;

    beforeAll(async () => {
      ownerAccount = await createAccount(owner, {
        name: 'Owner bank',
        openingBalance: '1000.10',
        isDefault: true,
      });
    });

    it('returns the account to its owner with exact decimal amounts', async () => {
      const response = await owner
        .get(`/api/accounts/${ownerAccount.uuid}`)
        .expect(200);

      expect(dataOf<AccountShape>(response.body)).toMatchObject({
        name: 'Owner bank',
        openingBalance: '1000.10',
        currentBalance: '1000.10',
        isDefault: true,
      });
    });

    it.each([
      [
        'GET',
        (agent: AuthAgent, uuid: string) => agent.get(`/api/accounts/${uuid}`),
      ],
      [
        'PATCH',
        (agent: AuthAgent, uuid: string) =>
          agent.patch(`/api/accounts/${uuid}`).send({ name: 'Taken' }),
      ],
      [
        'PUT status',
        (agent: AuthAgent, uuid: string) =>
          agent
            .put(`/api/accounts/${uuid}/status`)
            .send({ status: 'INACTIVE' }),
      ],
      [
        'DELETE',
        (agent: AuthAgent, uuid: string) =>
          agent.delete(`/api/accounts/${uuid}`),
      ],
    ])('answers 404 to an admin who tries %s on it', async (_, send) => {
      await send(admin, ownerAccount.uuid).expect(404);
    });

    it("leaves the owner's account untouched and out of the admin's list", async () => {
      const adminList = await admin.get('/api/accounts').expect(200);

      const ownerView = await owner
        .get(`/api/accounts/${ownerAccount.uuid}`)
        .expect(200);

      expect(
        dataOf<AccountShape[]>(adminList.body).map((account) => account.uuid),
      ).not.toContain(ownerAccount.uuid);
      expect(dataOf<AccountShape>(ownerView.body)).toMatchObject({
        name: 'Owner bank',
        status: 'ACTIVE',
      });
    });

    it('keeps a single default account per user', async () => {
      const second = await createAccount(owner, {
        name: 'Owner wallet',
        type: 'CASH',
        openingBalance: '0.20',
        isDefault: true,
      });

      const list = dataOf<AccountShape[]>(
        (await owner.get('/api/accounts').expect(200)).body,
      );

      expect(
        list.filter((account) => account.isDefault).map((a) => a.uuid),
      ).toEqual([second.uuid]);
    });

    // Without the per-user lock, renaming the old default reads it before the
    // switch commits and writes its stale default flag back.
    it('keeps one default while concurrent requests switch and edit accounts', async () => {
      const racer = await createAuthAgent(app, await createIsolatedUser(app));

      const previous = await createAccount(racer, {
        name: 'Previous default',
        openingBalance: '1',
        isDefault: true,
      });

      const next = await createAccount(racer, {
        name: 'Next default',
        openingBalance: '2',
        isDefault: false,
      });

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, round) => [
          racer
            .patch(`/api/accounts/${next.uuid}`)
            .send({ isDefault: round % 2 === 0 }),
          racer
            .patch(`/api/accounts/${previous.uuid}`)
            .send({ name: `Previous default ${round}` }),
        ]).flat(),
      );

      expect(responses.map(({ status }) => status)).toEqual(
        responses.map(() => 200),
      );

      const list = dataOf<AccountShape[]>(
        (await racer.get('/api/accounts').expect(200)).body,
      );

      expect(
        list.filter((account) => account.isDefault).length,
      ).toBeLessThanOrEqual(1);
    });

    it('archives an account, hides it from the default list, and clears its default flag', async () => {
      const account = await createAccount(owner, {
        name: 'To archive',
        openingBalance: '5',
        isDefault: true,
      });

      const archived = await owner
        .put(`/api/accounts/${account.uuid}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      expect(dataOf<AccountShape>(archived.body)).toMatchObject({
        status: 'INACTIVE',
        isDefault: false,
      });
      await owner.get(`/api/accounts/${account.uuid}`).expect(409);

      const archivedList = dataOf<AccountShape[]>(
        (await owner.get('/api/accounts?status=INACTIVE').expect(200)).body,
      );

      expect(archivedList.map((item) => item.uuid)).toContain(account.uuid);
    });

    it('rejects an amount with more than two decimal places', async () => {
      await owner
        .post('/api/accounts')
        .send({
          name: 'Imprecise',
          type: 'CHECKING',
          openingBalance: '1.005',
          openingBalanceDate: '2026-10-01',
        })
        .expect(400);
    });
  });

  describe('categories', () => {
    let ownerCategory: CategoryShape;

    beforeAll(async () => {
      const response = await owner
        .post('/api/categories')
        .send({ name: 'Owner pets', kind: 'EXPENSE', color: '#123456' })
        .expect(201);

      ownerCategory = dataOf<CategoryShape>(response.body);
    });

    it('lists the global catalog and the own categories to the owner', async () => {
      const response = await owner
        .get('/api/categories?kind=EXPENSE')
        .set('Accept-Language', 'en')
        .expect(200);

      const categories = dataOf<CategoryShape[]>(response.body);

      expect(categories.map((category) => category.uuid)).toContain(
        ownerCategory.uuid,
      );
      expect(categories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Food', scope: 'GLOBAL' }),
        ]),
      );
    });

    it("hides the owner's personal category from an admin", async () => {
      const list = dataOf<CategoryShape[]>(
        (await admin.get('/api/categories').expect(200)).body,
      );

      expect(list.map((category) => category.uuid)).not.toContain(
        ownerCategory.uuid,
      );
      await admin.get(`/api/categories/${ownerCategory.uuid}`).expect(404);
      await admin
        .patch(`/api/categories/${ownerCategory.uuid}`)
        .send({ name: 'Taken' })
        .expect(404);
      await admin
        .put(`/api/categories/${ownerCategory.uuid}/status`)
        .send({ status: 'INACTIVE' })
        .expect(404);
    });

    it('keeps global categories read-only, even for an admin', async () => {
      const [food] = dataOf<CategoryShape[]>(
        (
          await admin
            .get('/api/categories?scope=GLOBAL&kind=EXPENSE')
            .set('Accept-Language', 'en')
            .expect(200)
        ).body,
      ).filter((category) => category.name === 'Food');

      await admin
        .patch(`/api/categories/${food.uuid}`)
        .send({ name: 'Mine' })
        .expect(403);
      await admin
        .put(`/api/categories/${food.uuid}/status`)
        .send({ status: 'INACTIVE' })
        .expect(403);
    });
  });

  describe('preferences and dashboard', () => {
    it('saves preferences per user', async () => {
      await owner
        .patch('/api/preferences')
        .send({ spendingPerspective: 'INVOICE_MONTH', defaultMonth: 'NEXT' })
        .expect(200);

      const ownerPreferences = await owner.get('/api/preferences').expect(200);
      const adminPreferences = await admin.get('/api/preferences').expect(200);

      expect(
        dataOf<{ spendingPerspective: string }>(ownerPreferences.body),
      ).toMatchObject({ spendingPerspective: 'INVOICE_MONTH' });
      expect(
        dataOf<{ spendingPerspective: string }>(adminPreferences.body),
      ).toMatchObject({ spendingPerspective: 'PURCHASE_DATE' });
    });

    it("totals only the caller's own active accounts", async () => {
      const response = await owner
        .get('/api/dashboard?year=2026&month=10')
        .expect(200);

      const dashboard = dataOf<DashboardShape>(response.body);

      expect(dashboard.period).toMatchObject({ year: 2026, month: 10 });
      expect(dashboard.perspective).toBe('INVOICE_MONTH');
      expect(dashboard.balances).toEqual({
        actual: '1000.30',
        projected: '1000.30',
      });

      const adminDashboard = dataOf<DashboardShape>(
        (await admin.get('/api/dashboard?year=2026&month=10').expect(200)).body,
      );

      expect(
        adminDashboard.accounts.map((account) => account.actualBalance),
      ).not.toContain('1000.10');
    });

    it('overrides the perspective for one request without saving it', async () => {
      const response = await owner
        .get('/api/dashboard?year=2026&month=10&perspective=PURCHASE_DATE')
        .expect(200);

      expect(dataOf<DashboardShape>(response.body).perspective).toBe(
        'PURCHASE_DATE',
      );

      const preferences = await owner.get('/api/preferences').expect(200);

      expect(
        dataOf<{ spendingPerspective: string }>(preferences.body)
          .spendingPerspective,
      ).toBe('INVOICE_MONTH');
    });

    it('rejects a month sent without its year', async () => {
      await owner.get('/api/dashboard?month=10').expect(400);
    });
  });
});
