import { escapeHtml } from './escape-html';

export interface ActionEmailContent {
  heading: string;
  greeting: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  expiryNotice: string;
  fallbackNotice: string;
  ignoreNotice: string;
  footer: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderActionEmail(content: ActionEmailContent): RenderedEmail {
  const heading = escapeHtml(content.heading);
  const greeting = escapeHtml(content.greeting);
  const intro = escapeHtml(content.intro);
  const ctaLabel = escapeHtml(content.ctaLabel);
  const ctaUrl = escapeHtml(content.ctaUrl);
  const expiryNotice = escapeHtml(content.expiryNotice);
  const fallbackNotice = escapeHtml(content.fallbackNotice);
  const ignoreNotice = escapeHtml(content.ignoreNotice);
  const footer = escapeHtml(content.footer);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 16px;">${heading}</h1>
      <p style="margin: 0 0 12px;">${greeting}</p>
      <p style="margin: 0 0 24px;">${intro}</p>
      <p style="margin: 0 0 24px;">
        <a href="${ctaUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">${ctaLabel}</a>
      </p>
      <p style="margin: 0 0 4px; font-size: 13px; color: #4b5563;">${fallbackNotice}</p>
      <p style="margin: 0 0 24px; font-size: 13px; word-break: break-all;"><a href="${ctaUrl}" style="color: #2563eb;">${ctaUrl}</a></p>
      <p style="margin: 0 0 8px; font-size: 13px; color: #4b5563;">${expiryNotice}</p>
      <p style="margin: 0 0 24px; font-size: 13px; color: #4b5563;">${ignoreNotice}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">${footer}</p>
    </div>
  `.trim();

  const text = [
    content.heading,
    '',
    content.greeting,
    content.intro,
    '',
    `${content.ctaLabel}: ${content.ctaUrl}`,
    '',
    content.fallbackNotice,
    content.ctaUrl,
    '',
    content.expiryNotice,
    content.ignoreNotice,
    '',
    content.footer,
  ].join('\n');

  return { html, text };
}
