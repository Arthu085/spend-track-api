import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '@core/config';
import { ACCESS_TOKEN_COOKIE } from '@modules/auth/presentation';

export const ACCESS_TOKEN_SECURITY_SCHEME = 'cookie';

interface SwaggerUiRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

// Swagger UI receives this function via toString(), so it runs in the browser
// without closures: the cookie name, header name, and safe methods stay inline.
function attachCredentialsAndCsrfHeader(
  req: SwaggerUiRequest,
): SwaggerUiRequest {
  req.credentials = 'include';

  const method = (req.method ?? 'GET').toUpperCase();
  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);

  const isSameOrigin =
    new URL(req.url, window.location.href).origin === window.location.origin;

  if (isSafeMethod || !isSameOrigin) {
    return req;
  }

  const prefix = 'csrf_token=';

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix));

  if (cookie !== undefined) {
    req.headers = {
      ...req.headers,
      'X-CSRF-Token': decodeURIComponent(cookie.slice(prefix.length)),
    };
  }

  return req;
}

interface PackageMetadata {
  version: string;
  description: string;
}

function readPackageMetadata(): PackageMetadata {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageMetadata;
}

export function setupSwagger(app: INestApplication): void {
  const config = app.get(AppConfigService);

  if (config.app.nodeEnv === 'production') {
    return;
  }

  const { version, description } = readPackageMetadata();

  const documentConfig = new DocumentBuilder()
    .setTitle('Spend Track API')
    .setDescription(description)
    .setVersion(version)
    .addCookieAuth(
      ACCESS_TOKEN_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Signed httpOnly access token cookie set by login and refresh (docs/conventions.md, HTTP).',
      },
      ACCESS_TOKEN_SECURITY_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig, {
    autoTagControllers: false,
  });

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    swaggerOptions: {
      requestInterceptor: attachCredentialsAndCsrfHeader,
    },
  });
}
