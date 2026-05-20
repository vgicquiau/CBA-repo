import { Logger } from '@aws-lambda-powertools/logger';

export const logger = new Logger({
  serviceName: 'clos-bon-accueil',
  logLevel: (process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') ?? 'INFO',
});
