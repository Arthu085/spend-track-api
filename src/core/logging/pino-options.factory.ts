import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';

export interface BuildPinoHttpOptionsParams {
  level: string;
  pretty: boolean;
}

const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

const SAFE_REQUEST_ID = /^[\w-]{1,100}$/;

const genReqId = (req: IncomingMessage, res: ServerResponse): string => {
  const inboundId = req.headers['x-request-id'];

  const requestId =
    typeof inboundId === 'string' && SAFE_REQUEST_ID.test(inboundId)
      ? inboundId
      : randomUUID();

  res.setHeader('X-Request-Id', requestId);

  return requestId;
};

export const buildPinoHttpOptions = ({
  level,
  pretty,
}: BuildPinoHttpOptionsParams): Params => {
  const pinoHttp: Options = {
    level,
    genReqId,
    redact: {
      paths: REDACTED_PATHS,
      remove: true,
    },
    serializers: {
      req: (req: IncomingMessage) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
    },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  };

  return {
    pinoHttp,
    forRoutes: ['{*path}'],
  };
};
