import {
  type NoticeEmailContent,
  renderNoticeEmail,
} from '../notice-email.template';

describe('renderNoticeEmail', () => {
  const content: NoticeEmailContent = {
    heading: 'Your account email was changed',
    intro: 'The email address used to sign in to your account was changed.',
    warning: 'If you did not make this change, contact your administrator.',
    footer: 'This is an automated message.',
  };

  it('includes every copy string in both html and text, with no link', () => {
    const { html, text } = renderNoticeEmail(content);

    for (const value of Object.values(content)) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }

    expect(html).not.toContain('<a ');
    expect(text).not.toContain('http');
  });

  it('escapes unsafe HTML in the html output but not in the text output', () => {
    const { html, text } = renderNoticeEmail({
      ...content,
      intro: `<script>alert('xss')</script>`,
    });

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain("<script>alert('xss')</script>");
  });
});
