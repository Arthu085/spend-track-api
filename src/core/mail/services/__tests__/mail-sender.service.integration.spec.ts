import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import type { AppConfigService } from '@core/config';
import { MailSenderService } from '../mail-sender.service';

const MAILPIT_IMAGE = 'axllent/mailpit:latest';
const SMTP_PORT = 1025;
const HTTP_PORT = 8025;

interface MailpitMessageSummary {
  To: Array<{ Address: string }>;
  Subject: string;
}

interface MailpitMessagesResponse {
  messages_count: number;
  messages: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
  HTML: string;
  Text: string;
}

describe('MailSenderService (integration)', () => {
  let container: StartedTestContainer;
  let service: MailSenderService;
  let httpBaseUrl: string;

  beforeAll(async () => {
    container = await new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(SMTP_PORT, HTTP_PORT)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();

    httpBaseUrl = `http://${container.getHost()}:${container.getMappedPort(HTTP_PORT)}`;

    const config = {
      mail: {
        transport: 'smtp',
        host: container.getHost(),
        port: container.getMappedPort(SMTP_PORT),
        secure: false,
        user: '',
        password: '',
        from: 'App <no-reply@example.com>',
        confirmEmailPath: '/confirm-email',
        resetPasswordPath: '/reset-password',
      },
    } as unknown as AppConfigService;

    service = new MailSenderService(config);
  }, 60_000);

  afterAll(async () => {
    service.onModuleDestroy();
    await container.stop();
  }, 30_000);

  async function fetchMessages(): Promise<MailpitMessagesResponse> {
    const response = await fetch(`${httpBaseUrl}/api/v1/messages`);

    return response.json() as Promise<MailpitMessagesResponse>;
  }

  async function fetchMessageDetail(id: string): Promise<MailpitMessageDetail> {
    const response = await fetch(`${httpBaseUrl}/api/v1/message/${id}`);

    return response.json() as Promise<MailpitMessageDetail>;
  }

  async function waitForMessageCount(
    count: number,
  ): Promise<MailpitMessagesResponse> {
    const deadline = Date.now() + 10_000;

    for (;;) {
      const messages = await fetchMessages();

      if (messages.messages_count >= count) {
        return messages;
      }

      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${count} message(s) to arrive in Mailpit`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  it('delivers a real email through SMTP and it is retrievable via the Mailpit API', async () => {
    await service.send({
      to: 'jane@example.com',
      subject: 'Confirm your email',
      html: '<p>Hello Jane, please confirm your email.</p>',
      text: 'Hello Jane, please confirm your email.',
    });

    const messages = await waitForMessageCount(1);

    expect(messages.messages_count).toBe(1);

    const [summary] = messages.messages;
    expect(summary.Subject).toBe('Confirm your email');
    expect(summary.To[0].Address).toBe('jane@example.com');

    const detail = await fetchMessageDetail('latest');
    expect(detail.HTML).toContain('please confirm your email');
    expect(detail.Text).toContain('please confirm your email');
  }, 30_000);
});
