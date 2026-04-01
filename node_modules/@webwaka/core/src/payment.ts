export interface ChargeResult {
  success: boolean;
  reference: string;
  amountKobo: number;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  error?: string;
}

export interface SplitRecipient {
  subaccountCode: string;
  amountKobo: number;
}

export interface IPaymentProvider {
  verifyCharge(reference: string): Promise<ChargeResult>;
  initiateRefund(reference: string, amountKobo?: number): Promise<RefundResult>;
  initiateSplit(
    totalKobo: number,
    recipients: SplitRecipient[],
    reference: string
  ): Promise<ChargeResult>;
  initiateTransfer(
    recipientCode: string,
    amountKobo: number,
    reference: string
  ): Promise<{ success: boolean; transferCode: string; error?: string }>;
}

export class PaystackProvider implements IPaymentProvider {
  private secretKey: string;
  private baseUrl = 'https://api.paystack.co';

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async verifyCharge(reference: string): Promise<ChargeResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        { method: 'GET', headers: this.headers }
      );
      const data = (await res.json()) as any;
      if (!res.ok || !data.status) {
        return {
          success: false,
          reference,
          amountKobo: 0,
          error: data.message ?? 'Verification failed',
        };
      }
      return {
        success: data.data?.status === 'success',
        reference,
        amountKobo: data.data?.amount ?? 0,
        error: data.data?.status !== 'success' ? data.data?.gateway_response : undefined,
      };
    } catch (err: any) {
      return { success: false, reference, amountKobo: 0, error: err?.message };
    }
  }

  async initiateRefund(reference: string, amountKobo?: number): Promise<RefundResult> {
    try {
      const body: Record<string, unknown> = { transaction: reference };
      if (amountKobo !== undefined) body.amount = amountKobo;

      const res = await fetch(`${this.baseUrl}/refund`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data.status) {
        return { success: false, refundId: '', error: data.message ?? 'Refund failed' };
      }
      return { success: true, refundId: String(data.data?.id ?? '') };
    } catch (err: any) {
      return { success: false, refundId: '', error: err?.message };
    }
  }

  async initiateSplit(
    totalKobo: number,
    recipients: SplitRecipient[],
    reference: string
  ): Promise<ChargeResult> {
    const subaccounts = recipients.map((r) => ({
      subaccount: r.subaccountCode,
      amount: r.amountKobo,
    }));

    try {
      const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          amount: totalKobo,
          reference,
          split: { type: 'flat', subaccounts },
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data.status) {
        return {
          success: false,
          reference,
          amountKobo: totalKobo,
          error: data.message ?? 'Split initiation failed',
        };
      }
      return { success: true, reference, amountKobo: totalKobo };
    } catch (err: any) {
      return { success: false, reference, amountKobo: totalKobo, error: err?.message };
    }
  }

  async initiateTransfer(
    recipientCode: string,
    amountKobo: number,
    reference: string
  ): Promise<{ success: boolean; transferCode: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/transfer`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          source: 'balance',
          amount: amountKobo,
          recipient: recipientCode,
          reference,
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data.status) {
        return {
          success: false,
          transferCode: '',
          error: data.message ?? 'Transfer failed',
        };
      }
      return { success: true, transferCode: data.data?.transfer_code ?? '' };
    } catch (err: any) {
      return { success: false, transferCode: '', error: err?.message };
    }
  }
}

export function createPaymentProvider(secretKey: string): IPaymentProvider {
  return new PaystackProvider(secretKey);
}
