import { SetMetadata } from '@nestjs/common';

export const PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY =
  'endpoint:public-auth-flow-throttle';

export const PublicAuthFlowThrottle = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY, true);
