/**
 * CORE-7: Unified Notification Service
 * Blueprint Reference: Part 10.12 (Cross-Cutting Functional Modules)
 * Blueprint Reference: Part 9.1 #5 (Nigeria First - Yournotify, Termii)
 * 
 * Implements event-driven email, SMS, and push notification dispatchers.
 */

import { logger } from '../logger';

export interface NotificationPayload {
  tenantId: string;
  userId: string;
  type: 'email' | 'sms' | 'push';
  recipient: string; // email address, phone number, or device token
  subject?: string;
  body: string;
}

export interface NotificationConfig {
  yournotifyApiKey?: string;
  termiiApiKey?: string;
  termiiSenderId?: string;
}

export class NotificationService {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Dispatches a notification based on its type.
   */
  async dispatch(payload: NotificationPayload): Promise<boolean> {
    switch (payload.type) {
      case 'email':
        return this.sendEmail(payload);
      case 'sms':
        return this.sendSms(payload);
      case 'push':
        return this.sendPush(payload);
      default:
        throw new Error(`Unsupported notification type: ${payload.type}`);
    }
  }

  /**
   * Sends an email using Yournotify (Nigeria-First Service)
   */
  private async sendEmail(payload: NotificationPayload): Promise<boolean> {
    if (!this.config.yournotifyApiKey) {
      logger.warn('Yournotify API key missing. Email not sent.', {
        tenantId: payload.tenantId,
        recipient: payload.recipient,
      });
      return false;
    }

    try {
      const response = await fetch('https://api.yournotify.com/v1/campaigns/email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.yournotifyApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: payload.recipient,
          subject: payload.subject || 'Notification from WebWaka',
          html: payload.body
        })
      });

      if (!response.ok) {
        throw new Error(`Yournotify API error: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      logger.error('Failed to send email via Yournotify', { tenantId: payload.tenantId }, error as Error);
      return false;
    }
  }

  /**
   * Sends an SMS using Termii (Nigeria-First Service)
   */
  private async sendSms(payload: NotificationPayload): Promise<boolean> {
    if (!this.config.termiiApiKey) {
      logger.warn('Termii API key missing. SMS not sent.', {
        tenantId: payload.tenantId,
        recipient: payload.recipient,
      });
      return false;
    }

    try {
      const response = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: payload.recipient,
          from: this.config.termiiSenderId || 'WebWaka',
          sms: payload.body,
          type: 'plain',
          channel: 'generic',
          api_key: this.config.termiiApiKey
        })
      });

      if (!response.ok) {
        throw new Error(`Termii API error: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      logger.error('Failed to send SMS via Termii', { tenantId: payload.tenantId }, error as Error);
      return false;
    }
  }

  /**
   * Sends a push notification (Mock implementation for now)
   */
  private async sendPush(payload: NotificationPayload): Promise<boolean> {
    logger.info('Push notification sent', {
      tenantId: payload.tenantId,
      recipient: payload.recipient,
      body: payload.body,
    });
    return true;
  }
}
