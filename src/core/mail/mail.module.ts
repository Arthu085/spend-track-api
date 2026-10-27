import { Module } from '@nestjs/common';
import { MailSenderService } from './services/mail-sender.service';

@Module({
  providers: [MailSenderService],
  exports: [MailSenderService],
})
export class CoreMailModule {}
