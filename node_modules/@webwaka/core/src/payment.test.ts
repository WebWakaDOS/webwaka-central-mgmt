import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaystackProvider, createPaymentProvider } from './payment';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const provider = new PaystackProvider('sk_test_key');

describe('PaystackProvider.verifyCharge', () => {
  it('returns success when Paystack responds with status: true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        status: true,
        data: { reference: 'ref-001', amount: 50000, status: 'success' },
      }),
    });
    const result = await provider.verifyCharge('ref-001');
    expect(result.success).toBe(true);
    expect(result.reference).toBe('ref-001');
    expect(result.amountKobo).toBe(50000);
  });

  it('returns failure when Paystack responds with status: false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: false, message: 'Invalid key' }),
    });
    const result = await provider.verifyCharge('ref-bad');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid key');
  });

  it('returns failure when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await provider.verifyCharge('ref-err');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('returns failure when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });
    const result = await provider.verifyCharge('ref-unauth');
    expect(result.success).toBe(false);
  });
});

describe('PaystackProvider.initiateRefund', () => {
  it('returns success with refundId on successful refund', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: true, data: { id: 'rfnd-123' } }),
    });
    const result = await provider.initiateRefund('ref-001', 50000);
    expect(result.success).toBe(true);
    expect(result.refundId).toBe('rfnd-123');
  });

  it('returns failure when Paystack returns status: false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: false, message: 'Refund failed' }),
    });
    const result = await provider.initiateRefund('ref-001');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Refund failed');
  });

  it('returns failure when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));
    const result = await provider.initiateRefund('ref-err');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});

describe('PaystackProvider.initiateSplit', () => {
  it('returns success when split initiation succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: true, data: {} }),
    });
    const result = await provider.initiateSplit(
      100000,
      [{ subaccountCode: 'ACCT_abc', amountKobo: 60000 }],
      'split-ref-1'
    );
    expect(result.success).toBe(true);
    expect(result.reference).toBe('split-ref-1');
    expect(result.amountKobo).toBe(100000);
  });

  it('returns failure when Paystack returns status: false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ status: false, message: 'Split failed' }),
    });
    const result = await provider.initiateSplit(100000, [], 'split-ref-2');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Split failed');
  });

  it('returns failure when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network'));
    const result = await provider.initiateSplit(100000, [], 'split-ref-3');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network');
  });
});

describe('PaystackProvider.initiateTransfer', () => {
  it('returns success with transferCode', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: true, data: { transfer_code: 'TRF_abc' } }),
    });
    const result = await provider.initiateTransfer('RCP_xyz', 25000, 'trf-ref-1');
    expect(result.success).toBe(true);
    expect(result.transferCode).toBe('TRF_abc');
  });

  it('returns failure when Paystack returns status: false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ status: false, message: 'Transfer failed' }),
    });
    const result = await provider.initiateTransfer('RCP_xyz', 25000, 'trf-ref-2');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Transfer failed');
  });

  it('returns failure when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));
    const result = await provider.initiateTransfer('RCP_xyz', 25000, 'trf-ref-3');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});

describe('createPaymentProvider', () => {
  it('returns a PaystackProvider instance', () => {
    const p = createPaymentProvider('sk_live_key');
    expect(p).toBeInstanceOf(PaystackProvider);
  });
});
