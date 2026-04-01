import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './index';

describe('Platform Logger', () => {
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it('logs info messages with context', () => {
    logger.info('User logged in', { tenantId: 'tenant-123', userId: 'user-456' });

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const call = consoleInfoSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.level).toBe('info');
    expect(entry.message).toBe('User logged in');
    expect(entry.context.tenantId).toBe('tenant-123');
    expect(entry.context.userId).toBe('user-456');
    expect(entry.timestamp).toBeDefined();
  });

  it('logs warning messages', () => {
    logger.warn('API rate limit approaching', { tenantId: 'tenant-123' });

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    const call = consoleWarnSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('API rate limit approaching');
    expect(entry.context.tenantId).toBe('tenant-123');
  });

  it('logs error messages with error object', () => {
    const error = new Error('Database connection failed');
    logger.error('Database operation failed', { tenantId: 'tenant-123' }, error);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const call = consoleErrorSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.level).toBe('error');
    expect(entry.message).toBe('Database operation failed');
    expect(entry.context.tenantId).toBe('tenant-123');
    expect(entry.error.message).toBe('Database connection failed');
    expect(entry.error.stack).toBeDefined();
  });

  it('handles error as second parameter', () => {
    const error = new Error('Connection timeout');
    logger.error('Request failed', error);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const call = consoleErrorSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.level).toBe('error');
    expect(entry.message).toBe('Request failed');
    expect(entry.error.message).toBe('Connection timeout');
  });

  it('logs messages without context', () => {
    logger.info('System started');

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const call = consoleInfoSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.level).toBe('info');
    expect(entry.message).toBe('System started');
    expect(entry.context).toBeUndefined();
  });

  it('includes timestamp in all log entries', () => {
    logger.info('Test message');

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const call = consoleInfoSpy.mock.calls[0][0];
    const entry = JSON.parse(call);

    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('never uses console.log (uses console.info/warn/error)', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Test info');
    logger.warn('Test warn');
    logger.error('Test error');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });
});
