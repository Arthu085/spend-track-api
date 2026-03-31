import { SwaggerOptions } from './swagger.types';
import packageJson from '../../../../package.json';

export const swaggerConfig: SwaggerOptions = {
  title: 'Spend Track API',
  description: 'API for tracking expenses and managing budgets',
  version: packageJson.version,
  tag: 'Spend Track API',
};
