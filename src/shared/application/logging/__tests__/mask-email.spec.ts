import { describeError } from '../describe-error';
import { maskEmail, redactEmails } from '../mask-email';

describe('maskEmail', () => {
  it('keeps only the first local-part character and the domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('hides the length of the local part', () => {
    expect(maskEmail('a@example.com')).toBe(maskEmail('abcdef@example.com'));
  });

  it('fully masks a value without a local part or separator', () => {
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('redactEmails', () => {
  it('masks every email address embedded in free text', () => {
    expect(
      redactEmails(
        '550 <jane+news@example.com> rejected; cc john.doe@mail.example.org',
      ),
    ).toBe('550 <j***@example.com> rejected; cc j***@mail.example.org');
  });

  it('masks addresses with non-ASCII or apostrophe local parts without leaking a prefix', () => {
    expect(redactEmails("josé@exemplo.com.br and o'brien@example.com")).toBe(
      'j***@exemplo.com.br and o***@example.com',
    );
  });

  it('stays linear on long input without an address', () => {
    const text = 'a'.repeat(200_000);

    expect(redactEmails(text)).toBe(text);
  });

  it('leaves text without email addresses unchanged', () => {
    expect(redactEmails('connection refused')).toBe('connection refused');
  });
});

describe('describeError', () => {
  it('returns the message of an Error with emails masked', () => {
    expect(describeError(new Error('bounced for jane@example.com'))).toBe(
      'bounced for j***@example.com',
    );
  });

  it('stringifies a non-Error value with emails masked', () => {
    expect(describeError('jane@example.com unreachable')).toBe(
      'j***@example.com unreachable',
    );
  });
});
