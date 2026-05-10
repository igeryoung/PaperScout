import 'server-only';
import pino from 'pino';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
const logLevel = LOG_LEVELS.includes(process.env.LOG_LEVEL as (typeof LOG_LEVELS)[number])
  ? process.env.LOG_LEVEL
  : process.env.NODE_ENV === 'test'
    ? 'silent'
  : 'info';

export const logger = pino({
  level: logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
