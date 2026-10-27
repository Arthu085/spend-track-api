import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PUBLIC_METADATA_KEY } from '@shared/presentation/metadata';

export interface RegisteredRoute {
  controller: string;
  handler: string;
  route: string;
  isPublic: boolean;
}

function joinPath(...parts: string[]): string {
  const segments = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0);

  return `/${segments.join('/')}`;
}

// Lists routes in Nest's registration order: controllers as declared in the
// module, then handlers as declared in each controller.
export function registeredRoutesOf(module: Type): RegisteredRoute[] {
  const controllers = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    module,
  ) as Type[];

  return controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const prototype = controller.prototype as Record<string, object>;

    return Object.getOwnPropertyNames(prototype)
      .filter((handler) =>
        Reflect.hasMetadata(METHOD_METADATA, prototype[handler]),
      )
      .map((handler) => {
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          prototype[handler],
        ) as RequestMethod;

        const path = Reflect.getMetadata(
          PATH_METADATA,
          prototype[handler],
        ) as string;

        return {
          controller: controller.name,
          handler,
          route: `${RequestMethod[method]} ${joinPath(prefix, path)}`,
          isPublic:
            Reflect.getMetadata(PUBLIC_METADATA_KEY, prototype[handler]) ===
            true,
        };
      });
  });
}

function matches(earlier: string, later: string): boolean {
  const [earlierMethod, earlierPath] = earlier.split(' ');
  const [laterMethod, laterPath] = later.split(' ');
  const earlierSegments = earlierPath.split('/');
  const laterSegments = laterPath.split('/');

  return (
    earlierMethod === laterMethod &&
    earlierSegments.length === laterSegments.length &&
    earlierSegments.every(
      (segment, index) =>
        segment.startsWith(':') || segment === laterSegments[index],
    )
  );
}

// Express dispatches to the first registered match, so a route is unreachable
// when an earlier route with the same method matches every path it serves.
export function shadowedRoutes(routes: RegisteredRoute[]): string[] {
  return routes.flatMap((route, index) =>
    routes
      .slice(0, index)
      .filter((earlier) => matches(earlier.route, route.route))
      .map(
        (earlier) =>
          `${route.route} (${route.controller}.${route.handler}) is shadowed by ${earlier.route} (${earlier.controller}.${earlier.handler})`,
      ),
  );
}
