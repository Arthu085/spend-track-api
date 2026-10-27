import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppConfigService } from '@core/config';
import type { MailMessage } from '../types/mail-message.type';

const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

@Injectable()
export class MailSenderService implements OnModuleDestroy {
  private transporter?: Transporter;

  constructor(private readonly config: AppConfigService) {}

  async send(message: MailMessage): Promise<void> {
    const transporter = this.getTransporter();

    await transporter.sendMail({
      from: this.config.mail.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private getTransporter(): Transporter {
    if (this.transporter === undefined) {
      const { host, port, secure, user, password } = this.config.mail;

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        ...(user !== '' && password !== ''
          ? { auth: { user, pass: password } }
          : {}),
      });
    }

    return this.transporter;
  }
}
