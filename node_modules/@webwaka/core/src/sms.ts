export type OtpChannel = 'sms' | 'whatsapp' | 'whatsapp_business';

export interface OtpResult {
  success: boolean;
  messageId?: string;
  channel: OtpChannel;
  error?: string;
}

export interface ISmsProvider {
  sendOtp(to: string, message: string, channel?: OtpChannel): Promise<OtpResult>;
  sendMessage(to: string, message: string): Promise<OtpResult>;
}

export class TermiiProvider implements ISmsProvider {
  private apiKey: string;
  private senderId: string;
  private apiUrl = 'https://api.ng.termii.com/api/sms/send';

  constructor(apiKey: string, senderId = 'WebWaka') {
    this.apiKey = apiKey;
    this.senderId = senderId;
  }

  async sendOtp(to: string, message: string, channel: OtpChannel = 'whatsapp'): Promise<OtpResult> {
    const result = await this.deliver(to, message, channel);
    if (!result.success && channel !== 'sms') {
      return this.deliver(to, message, 'sms');
    }
    return result;
  }

  async sendMessage(to: string, message: string): Promise<OtpResult> {
    return this.sendOtp(to, message, 'whatsapp');
  }

  private async deliver(to: string, message: string, channel: OtpChannel): Promise<OtpResult> {
    const termiiChannel =
      channel === 'whatsapp' || channel === 'whatsapp_business' ? 'whatsapp' : 'generic';

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          from: this.senderId,
          sms: message,
          type: 'plain',
          channel: termiiChannel,
          api_key: this.apiKey,
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        return {
          success: false,
          channel,
          error: data?.message ?? 'Termii request failed',
        };
      }
      return {
        success: true,
        messageId: data?.message_id ?? data?.pinId,
        channel,
      };
    } catch (err: any) {
      return { success: false, channel, error: err?.message };
    }
  }
}

export function createSmsProvider(apiKey: string, senderId?: string): ISmsProvider {
  return new TermiiProvider(apiKey, senderId);
}

export async function sendTermiiSms(
  to: string,
  message: string,
  apiKey: string,
  senderId?: string
): Promise<OtpResult> {
  const provider = createSmsProvider(apiKey, senderId);
  return provider.sendMessage(to, message);
}
