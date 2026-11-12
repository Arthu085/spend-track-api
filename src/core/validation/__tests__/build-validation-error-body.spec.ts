import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { I18nValidationException } from 'nestjs-i18n';
import { mockOf } from '@test/support/mocks/mock-of';
import { buildValidationErrorBody } from '../build-validation-error-body';

describe('buildValidationErrorBody', () => {
  const createHost = (url: string) =>
    mockOf<ArgumentsHost>({
      switchToHttp: () => ({
        getRequest: <T>() => ({ url }) as T,
        getResponse: <T>() => ({}) as T,
        getNext: <T>() => (() => undefined) as T,
      }),
    });

  it('returns the documented error shape with the translated messages as an array', () => {
    const messages = [
      'O campo email é obrigatório',
      'O campo senha é obrigatório',
    ];

    const body = buildValidationErrorBody(
      createHost('/api/auth/login?x=1'),
      new I18nValidationException([]),
      messages,
    );

    expect(body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: messages,
      timestamp: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      ) as string,
      path: '/api/auth/login?x=1',
    });
  });

  it('uses the status of the validation exception', () => {
    const body = buildValidationErrorBody(
      createHost('/api/things'),
      new I18nValidationException([], HttpStatus.UNPROCESSABLE_ENTITY),
      ['invalid'],
    );

    expect(body.statusCode).toBe(422);
    expect(body.error).toBe('Unprocessable Entity');
  });
});
