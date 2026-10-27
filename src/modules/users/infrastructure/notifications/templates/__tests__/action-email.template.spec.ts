import {
  ActionEmailContent,
  renderActionEmail,
} from '../action-email.template';

describe('renderActionEmail', () => {
  const content: ActionEmailContent = {
    heading: 'Confirm your email',
    greeting: 'Hi Jane,',
    intro: 'Confirm your email address to activate your access.',
    ctaLabel: 'Confirm email',
    ctaUrl: 'https://app.example.com/confirm-email?token=abc123',
    expiryNotice: 'This link expires in 48 hour(s).',
    fallbackNotice: 'If the button does not work, copy this link:',
    ignoreNotice: 'If you did not request this, ignore this email.',
    footer: 'This is an automated message.',
  };

  it('includes the CTA URL and every copy string in both html and text', () => {
    const { html, text } = renderActionEmail(content);

    for (const value of [
      content.heading,
      content.greeting,
      content.intro,
      content.ctaLabel,
      content.expiryNotice,
      content.fallbackNotice,
      content.ignoreNotice,
      content.footer,
    ]) {
      expect(text).toContain(value);
    }

    expect(html).toContain(content.ctaUrl);
    expect(text).toContain(content.ctaUrl);
  });

  it('escapes unsafe HTML in the html output but not in the text output', () => {
    const unsafe: ActionEmailContent = {
      ...content,
      greeting: `Hi <script>alert('xss')</script>,`,
    };

    const { html, text } = renderActionEmail(unsafe);

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain('&lt;script&gt;');

    expect(text).toContain("Hi <script>alert('xss')</script>,");
  });

  it('escapes the CTA URL inside href attributes so it cannot break out of them', () => {
    const unsafe: ActionEmailContent = {
      ...content,
      ctaUrl: `https://app.example.com/confirm?a=1&b="x" onclick='y'><script>z</script>`,
    };

    const escapedUrl =
      'https://app.example.com/confirm?a=1&amp;b=&quot;x&quot; onclick=&#39;y&#39;&gt;&lt;script&gt;z&lt;/script&gt;';

    const { html, text } = renderActionEmail(unsafe);

    expect(html).not.toContain(unsafe.ctaUrl);
    expect(html).not.toContain('<script>');
    expect(html.match(/href="[^"]*"/g)).toEqual([
      `href="${escapedUrl}"`,
      `href="${escapedUrl}"`,
    ]);

    expect(text).toContain(unsafe.ctaUrl);
  });

  it('does not leak undefined or [object Object] into either output', () => {
    const { html, text } = renderActionEmail(content);

    expect(html).not.toContain('undefined');
    expect(html).not.toContain('[object Object]');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('[object Object]');
  });
});
