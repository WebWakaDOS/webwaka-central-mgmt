import { describe, it, expect, vi } from 'vitest';
import { assertNdprConsent, recordNdprConsent } from './ndpr';

describe('assertNdprConsent', () => {
  it('does not throw when ndpr_consent is true', () => {
    expect(() => assertNdprConsent({ ndpr_consent: true })).not.toThrow();
  });

  it('throws when ndpr_consent is false', () => {
    expect(() => assertNdprConsent({ ndpr_consent: false })).toThrow('NDPR consent is required');
  });

  it('throws when ndpr_consent is missing', () => {
    expect(() => assertNdprConsent({ name: 'test' })).toThrow('NDPR consent is required');
  });

  it('throws when body is null', () => {
    expect(() => assertNdprConsent(null)).toThrow('NDPR consent is required');
  });

  it('throws when body is a string', () => {
    expect(() => assertNdprConsent('yes')).toThrow('NDPR consent is required');
  });

  it('throws when body is a number', () => {
    expect(() => assertNdprConsent(1)).toThrow('NDPR consent is required');
  });

  it('attaches status 400 to the thrown error', () => {
    try {
      assertNdprConsent({});
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('NDPR_CONSENT_REQUIRED');
    }
  });
});

describe('recordNdprConsent', () => {
  it('calls db.prepare with INSERT OR IGNORE statement', async () => {
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const mockBind = vi.fn().mockReturnValue({ run: mockRun });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const mockDb = { prepare: mockPrepare } as any;

    await recordNdprConsent(mockDb, 'entity-1', 'user', '1.2.3.4', 'Mozilla/5.0');

    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO ndpr_consent_log')
    );
    expect(mockBind).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it('handles null ipAddress and userAgent', async () => {
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const mockBind = vi.fn().mockReturnValue({ run: mockRun });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const mockDb = { prepare: mockPrepare } as any;

    await expect(
      recordNdprConsent(mockDb, 'entity-2', 'organisation', null, null)
    ).resolves.not.toThrow();

    const bindArgs = mockBind.mock.calls[0];
    expect(bindArgs).toContain(null); // ipAddress null
  });
});
