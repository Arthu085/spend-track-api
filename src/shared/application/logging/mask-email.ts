const EMAIL_PATTERN =
  /[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,8}/gu;

export function maskEmail(email: string): string {
  const separatorIndex = email.lastIndexOf('@');

  if (separatorIndex <= 0) {
    return '***';
  }

  return `${email[0]}***${email.slice(separatorIndex)}`;
}

export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, (email) => maskEmail(email));
}
