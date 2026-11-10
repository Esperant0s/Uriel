// Phones keep no log file: writing one on every failed download only costs storage and battery. Errors and
// warnings from the in-app server go to the shareable error log (Settings → Share error log) instead of
// disappearing, so a failed download or import can still be diagnosed.
const describe = (message: string, err?: unknown): string => (err ? `${message}: ${(err instanceof Error && err.message) || err}` : message);
const toLog = (level: string, message: string): void => {
  try { if (typeof window !== 'undefined' && window.UrielLog) window.UrielLog.add(level, `[server] ${message}`); } catch (e) {}
};
const log = (level: string, message: string): void => { if (level === 'error' || level === 'warn') toLog(level, message); };
const error = (message: string, err?: unknown): void => toLog('error', describe(message, err));
const warn = (message: string, err?: unknown): void => toLog('warn', describe(message, err));
export = { log, error, warn, info: () => {}, tail: () => [], LOG_DIR: '/data/logs' };
