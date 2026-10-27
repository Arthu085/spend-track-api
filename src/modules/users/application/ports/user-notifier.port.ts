export const USER_NOTIFIER = Symbol('USER_NOTIFIER');

export interface SendEmailConfirmationInput {
  email: string;
  name: string;
  token: string;
  locale: string;
}

export interface SendPasswordResetInput {
  email: string;
  name: string;
  token: string;
  locale: string;
}

export interface SendUserChangeRequestInput {
  email: string;
  name: string;
  locale: string;
}

export interface SendEmailChangeNoticeInput {
  email: string;
  locale: string;
}

export interface UserNotifier {
  sendEmailConfirmation(input: SendEmailConfirmationInput): Promise<void>;
  sendPasswordReset(input: SendPasswordResetInput): Promise<void>;
  sendUserChangeRequest(input: SendUserChangeRequestInput): Promise<void>;
  sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void>;
}
