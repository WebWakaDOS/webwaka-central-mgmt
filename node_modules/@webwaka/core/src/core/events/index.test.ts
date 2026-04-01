import { describe, it, expect } from 'vitest';
import { createEvent, WebWakaEventType, type DomainEvent } from './index';

describe('CORE-14: Event Bus Primitives', () => {
  // ─── createEvent ─────────────────────────────────────────────────────────

  it('should create an event with correct structure', () => {
    const payload = { userId: 'u_1', email: 'user@example.com' };
    const event = createEvent(WebWakaEventType.AUTH_USER_LOGIN, 'tenant_alpha', payload);

    expect(event.id).toBeDefined();
    expect(typeof event.id).toBe('string');
    expect(event.type).toBe(WebWakaEventType.AUTH_USER_LOGIN);
    expect(event.tenantId).toBe('tenant_alpha');
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.payload).toEqual(payload);
  });

  it('should generate unique IDs for each createEvent call', () => {
    const e1 = createEvent(WebWakaEventType.CHAT_MESSAGE_SENT, 'tenant_alpha', {});
    const e2 = createEvent(WebWakaEventType.CHAT_MESSAGE_SENT, 'tenant_alpha', {});
    expect(e1.id).not.toBe(e2.id);
  });

  it('should set occurredAt to the current time', () => {
    const before = new Date();
    const event = createEvent(WebWakaEventType.BOOKING_CONFIRMED, 'tenant_beta', {});
    const after = new Date();

    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should accept an arbitrary typed payload', () => {
    interface BookingPayload { bookingId: string; resourceId: string }
    const payload: BookingPayload = { bookingId: 'bk_123', resourceId: 'res_42' };

    const event: DomainEvent<BookingPayload> = createEvent(
      WebWakaEventType.BOOKING_CONFIRMED,
      'tenant_beta',
      payload
    );

    expect(event.payload.bookingId).toBe('bk_123');
    expect(event.payload.resourceId).toBe('res_42');
  });

  it('should carry the tenantId supplied to createEvent', () => {
    const event = createEvent(WebWakaEventType.KYC_VERIFIED, 'tenant_gamma', { requestId: 'kyc_1' });
    expect(event.tenantId).toBe('tenant_gamma');
  });

  // ─── WebWakaEventType enum value stability (regression guard) ─────────────

  it('Auth event type values are stable strings', () => {
    expect(WebWakaEventType.AUTH_USER_LOGIN).toBe('auth.user.login');
    expect(WebWakaEventType.AUTH_USER_LOGOUT).toBe('auth.user.logout');
    expect(WebWakaEventType.AUTH_TOKEN_REFRESHED).toBe('auth.token.refreshed');
  });

  it('KYC event type values are stable strings', () => {
    expect(WebWakaEventType.KYC_SUBMITTED).toBe('kyc.submitted');
    expect(WebWakaEventType.KYC_VERIFIED).toBe('kyc.verified');
    expect(WebWakaEventType.KYC_REJECTED).toBe('kyc.rejected');
  });

  it('Booking event type values are stable strings', () => {
    expect(WebWakaEventType.BOOKING_CONFIRMED).toBe('booking.confirmed');
    expect(WebWakaEventType.BOOKING_CANCELLED).toBe('booking.cancelled');
  });

  it('Chat event type values are stable strings', () => {
    expect(WebWakaEventType.CHAT_MESSAGE_SENT).toBe('chat.message.sent');
    expect(WebWakaEventType.CHAT_CHANNEL_CREATED).toBe('chat.channel.created');
  });

  it('Document event type values are stable strings', () => {
    expect(WebWakaEventType.DOCUMENT_CREATED).toBe('document.created');
    expect(WebWakaEventType.DOCUMENT_SIGNED).toBe('document.signed');
  });

  it('Billing event type values are stable strings', () => {
    expect(WebWakaEventType.BILLING_DEBIT_RECORDED).toBe('billing.debit.recorded');
    expect(WebWakaEventType.BILLING_CREDIT_RECORDED).toBe('billing.credit.recorded');
  });

  it('Notification event type values are stable strings', () => {
    expect(WebWakaEventType.NOTIFICATION_SENT).toBe('notification.sent');
    expect(WebWakaEventType.NOTIFICATION_FAILED).toBe('notification.failed');
  });
});
