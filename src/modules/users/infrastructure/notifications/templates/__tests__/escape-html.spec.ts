import { escapeHtml } from '../escape-html';

describe('escapeHtml', () => {
  it('escapes &, <, >, " and \'', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('escapes a script injection attempt', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('leaves normal text untouched', () => {
    expect(escapeHtml('Jane Doe')).toBe('Jane Doe');
  });

  it('leaves an empty string untouched', () => {
    expect(escapeHtml('')).toBe('');
  });
});
