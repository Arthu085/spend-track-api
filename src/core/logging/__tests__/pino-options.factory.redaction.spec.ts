import { Writable } from 'node:stream';
import pino from 'pino';
import type { Options } from 'pino-http';
import { buildPinoHttpOptions } from '../pino-options.factory';

const asPinoLoggerOptions = (
  pinoHttp: ReturnType<typeof buildPinoHttpOptions>['pinoHttp'],
): pino.LoggerOptions => pinoHttp as Options;

describe('buildPinoHttpOptions redaction (content-level)', () => {
  it('strips secrets from the actual emitted log output', () => {
    const chunks: string[] = [];

    const captureStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const { pinoHttp } = buildPinoHttpOptions({ level: 'info', pretty: false });

    const logger = pino(asPinoLoggerOptions(pinoHttp), captureStream);

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/probe',
          headers: {
            cookie:
              'access_token=super-secret-value-123; refresh_token=another-secret-456',
            authorization: 'Bearer fake-secret-token-789',
          },
        },
        res: {
          headers: {
            'set-cookie': 'access_token=leaked-cookie-abc',
          },
        },
      },
      'request completed',
    );

    const output = chunks.join('');

    expect(output).not.toContain('super-secret-value-123');
    expect(output).not.toContain('another-secret-456');
    expect(output).not.toContain('fake-secret-token-789');
    expect(output).not.toContain('leaked-cookie-abc');

    expect(output).toContain('request completed');
    expect(output).toContain('"method":"GET"');
  });
});
