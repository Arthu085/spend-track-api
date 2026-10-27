import type { RenderedEmail } from './action-email.template';
import { escapeHtml } from './escape-html';

export interface NoticeEmailContent {
  heading: string;
  intro: string;
  warning: string;
  footer: string;
}

export function renderNoticeEmail(content: NoticeEmailContent): RenderedEmail {
  const heading = escapeHtml(content.heading);
  const intro = escapeHtml(content.intro);
  const warning = escapeHtml(content.warning);
  const footer = escapeHtml(content.footer);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 16px;">${heading}</h1>
      <p style="margin: 0 0 12px;">${intro}</p>
      <p style="margin: 0 0 24px; font-weight: bold;">${warning}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">${footer}</p>
    </div>
  `.trim();

  const text = [
    content.heading,
    '',
    content.intro,
    content.warning,
    '',
    content.footer,
  ].join('\n');

  return { html, text };
}
