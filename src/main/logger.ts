import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const levels = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof levels)[number];

function logFile(): string {
  try {
    return path.join(app.getPath('userData'), 'logs', 'launcher.log');
  } catch {
    return path.join(process.cwd(), 'launcher.log');
  }
}

function ensureLogDir() {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  } catch {
    /* ignore */
  }
}

function write(level: Level, msg: string, extra?: unknown) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}${
    extra !== undefined ? ' ' + safeJson(extra) : ''
  }\n`;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
  try {
    ensureLogDir();
    fs.appendFileSync(logFile(), line);
  } catch {
    /* ignore disk errors */
  }
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    // Redact obvious token-looking strings
    return s.replace(/"[A-Za-z0-9_-]{40,}"/g, '"[redacted]"');
  } catch {
    return String(v);
  }
}

export const log = {
  debug: (m: string, e?: unknown) => write('debug', m, e),
  info: (m: string, e?: unknown) => write('info', m, e),
  warn: (m: string, e?: unknown) => write('warn', m, e),
  error: (m: string, e?: unknown) => write('error', m, e),
  path: () => logFile(),
};
