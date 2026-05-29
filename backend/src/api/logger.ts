const level = (process.env.LOG_LEVEL ?? 'INFO').toUpperCase();

const levels: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function log(severity: string, message: string, extra?: unknown): void {
  if ((levels[severity] ?? 0) < (levels[level] ?? 1)) return;
  const entry = { severity, service: 'clos-bon-accueil', message, ...(extra ? { extra } : {}) };
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, extra?: unknown) => log('DEBUG', msg, extra),
  info:  (msg: string, extra?: unknown) => log('INFO',  msg, extra),
  warn:  (msg: string, extra?: unknown) => log('WARN',  msg, extra),
  error: (msg: string, extra?: unknown) => log('ERROR', msg, extra),
};
