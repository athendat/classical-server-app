import { Logger, LoggerService } from '@nestjs/common';
import { inspect } from 'util';

/**
 * Test helper: captures everything written to logs — every Nest `Logger` (via
 * `Logger.overrideLogger`) and every `console.*` call — so a spec can assert that
 * no secret reaches any log channel.
 *
 * Objects are serialized deeply (as a log transport would) so a secret nested
 * in an error or a response object is caught too.
 *
 * Call it after `Test.createTestingModule(...).compile()`: compiling a testing
 * module replaces the Nest logger.
 */
export interface LogCapture {
  /** Everything captured so far, plus any extra channel passed in, as one string */
  text(...extraChannels: unknown[]): string;
  /** Restores the original logger and console */
  restore(): void;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'dir', 'trace'] as const;

export function serializeForLog(value: unknown): string {
  return typeof value === 'string'
    ? value
    : inspect(value, { depth: 20, breakLength: Infinity, maxArrayLength: null, maxStringLength: null });
}

export function captureLogs(): LogCapture {
  const lines: string[] = [];
  const record = (...args: unknown[]): void => {
    lines.push(args.map(serializeForLog).join(' '));
  };

  const loggerRef = Logger as unknown as { staticInstanceRef?: LoggerService };
  const previousLogger = loggerRef.staticInstanceRef;
  const capturingLogger: LoggerService = {
    log: record,
    error: record,
    warn: record,
    debug: record,
    verbose: record,
    fatal: record,
  };
  Logger.overrideLogger(capturingLogger);

  const originalConsole = CONSOLE_METHODS.map((method) => [method, console[method]] as const);
  for (const method of CONSOLE_METHODS) {
    (console as unknown as Record<string, unknown>)[method] = record;
  }

  return {
    text: (...extraChannels: unknown[]) =>
      [...lines, ...extraChannels.map(serializeForLog)].join('\n'),
    restore: () => {
      loggerRef.staticInstanceRef = previousLogger;
      for (const [method, original] of originalConsole) {
        (console as unknown as Record<string, unknown>)[method] = original;
      }
    },
  };
}

/**
 * Asserts that none of the named secrets appears in the captured log text.
 * Reports every leaked secret by name, without printing the whole log.
 */
export function findLeakedSecrets(logText: string, secrets: Record<string, string>): string[] {
  return Object.entries(secrets)
    .filter(([, value]) => logText.toUpperCase().includes(value.toUpperCase()))
    .map(([name]) => name);
}
