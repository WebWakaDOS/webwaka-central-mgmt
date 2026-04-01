/**
 * Platform Logger Utility
 * 
 * Enforces the "Zero Console Logs" invariant across the WebWaka platform.
 * All logging must go through this module, never direct console.log/warn/error calls.
 * 
 * Blueprint Reference: Part 9.3 — "Zero Console Logs: No console.log statements. Must use platform logger."
 */

export interface LogContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

export interface SerializedError {
  message: string;
  stack?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: LogContext;
  error?: SerializedError;
}

/**
 * Platform Logger
 * 
 * Usage:
 *   logger.info("User logged in", { tenantId: "tenant-123", userId: "user-456" });
 *   logger.warn("API rate limit approaching", { tenantId: "tenant-123" });
 *   logger.error("Database connection failed", { tenantId: "tenant-123" }, error);
 *   logger.debug("Cache hit", { tenantId: "tenant-123", key: "user-profile" });
 */
class PlatformLogger {
  private isDevelopment = (globalThis as any).process?.env?.NODE_ENV === 'development';

  /**
   * Log informational message
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext | Error, error?: Error): void {
    let ctx = context as LogContext | undefined;
    let err = error;

    // Handle overload: error(message, error) or error(message, context, error)
    if (context instanceof Error) {
      err = context;
      ctx = undefined;
    }

    this.log('error', message, ctx, err);
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  /**
   * Internal logging implementation
   */
  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const serializedError: SerializedError | undefined = error !== undefined
      ? { message: error.message, ...(error.stack !== undefined ? { stack: error.stack } : {}) }
      : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context !== undefined ? { context } : {}),
      ...(serializedError !== undefined ? { error: serializedError } : {}),
    };

    // In production, this would send to a logging service (e.g., Datadog, Sentry)
    // For now, we output to stderr to avoid stdout pollution
    if (typeof console !== 'undefined') {
      const output = JSON.stringify(entry);

      switch (level) {
        case 'error':
          console.error(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        case 'debug':
          console.debug(output);
          break;
        case 'info':
        default:
          console.info(output);
          break;
      }
    }
  }
}

// Export singleton instance
export const logger = new PlatformLogger();
