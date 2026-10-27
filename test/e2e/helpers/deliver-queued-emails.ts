import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailJobHandlers } from '@modules/email-outbox/application/services/email-job-handlers.service';
import { normalizeEmail } from '@shared/application/filters';
import { EmailType } from '@shared/domain/enums/email-type.enum';

interface ClaimedRow {
  id: number;
  uuid: string;
  email_type: EmailType;
  recipient: string;
  locale: string;
  attempts: number;
}

// E2E apps run in parallel against one shared database with the outbox worker
// disabled (`setup-env.ts`). Draining the whole outbox would hand other spec
// files' jobs to this app's notifier double, so this delivers only the jobs
// queued for one recipient, through the app's registered job handlers.
export async function deliverQueuedEmails(
  app: INestApplication,
  recipient: string,
): Promise<number> {
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const handlers = app.get(EmailJobHandlers);

  const jobs = await dataSource.query<ClaimedRow[]>(
    `WITH claimed AS (
      UPDATE "email_outbox"
      SET status = 'PROCESSING', attempts = attempts + 1, locked_until = now() + interval '2 minutes'
      WHERE recipient = $1 AND status = 'PENDING'
      RETURNING id, uuid, email_type, recipient, locale, attempts
    )
    SELECT id, uuid, email_type, recipient, locale, attempts FROM claimed ORDER BY id`,
    [normalizeEmail(recipient)],
  );

  for (const [index, job] of jobs.entries()) {
    try {
      const handler = handlers.resolve(job.email_type);

      if (!handler) {
        throw new Error(
          `No email job handler registered for ${job.email_type}`,
        );
      }

      await handler.handle({
        uuid: job.uuid,
        emailType: job.email_type,
        recipient: job.recipient,
        locale: job.locale,
        attempt: job.attempts,
      });
    } catch (error) {
      // Release this and every later claimed job, so the spec's real failure
      // is not followed by confusing "nothing queued" assertions.
      await dataSource.query(
        `UPDATE "email_outbox" SET status = 'PENDING', locked_until = NULL WHERE id = ANY($1)`,
        [jobs.slice(index).map((pending) => pending.id)],
      );

      throw error;
    }

    await dataSource.query(
      `UPDATE "email_outbox" SET status = 'SENT', processed_at = now(), locked_until = NULL WHERE id = $1`,
      [job.id],
    );
  }

  return jobs.length;
}
