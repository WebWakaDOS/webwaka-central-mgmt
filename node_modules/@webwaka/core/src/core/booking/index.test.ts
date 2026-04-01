import { describe, it, expect, beforeEach } from 'vitest';
import { BookingEngine } from './index';

const T1 = 'tenant_alpha';
const T2 = 'tenant_beta';

describe('CORE-10: Universal Booking & Scheduling Engine', () => {
  let bookingEngine: BookingEngine;

  beforeEach(() => {
    bookingEngine = new BookingEngine();
  });

  it('should create a booking if resource is available', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    const booking = bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);
    expect(booking.status).toBe('confirmed');
    expect(booking.tenantId).toBe(T1);
    expect(booking.resourceId).toBe('res_1');
    expect(booking.userId).toBe('user_1');
    expect(booking.id).toMatch(/^bk_/);
    expect(booking.slot).toEqual(slot);
  });

  it('should reject booking if resource is not available (overlapping)', () => {
    const slot1 = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };
    const slot2 = {
      startTime: new Date('2026-03-15T10:30:00Z'),
      endTime: new Date('2026-03-15T11:30:00Z'),
    };

    bookingEngine.createBooking(T1, 'res_1', 'user_1', slot1);

    expect(() => {
      bookingEngine.createBooking(T1, 'res_1', 'user_2', slot2);
    }).toThrow('Resource is not available for the requested time slot');
  });

  it('should allow booking after cancellation', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    const booking1 = bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);
    const cancelled = bookingEngine.cancelBooking(T1, booking1.id);
    expect(cancelled).toBe(true);

    const booking2 = bookingEngine.createBooking(T1, 'res_1', 'user_2', slot);
    expect(booking2.status).toBe('confirmed');
  });

  it('should allow bookings for different resources in the same slot', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    const b1 = bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);
    const b2 = bookingEngine.createBooking(T1, 'res_2', 'user_2', slot);

    expect(b1.status).toBe('confirmed');
    expect(b2.status).toBe('confirmed');
  });

  it('should allow adjacent bookings (no overlap)', () => {
    const slot1 = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };
    const slot2 = {
      startTime: new Date('2026-03-15T11:00:00Z'),
      endTime: new Date('2026-03-15T12:00:00Z'),
    };

    bookingEngine.createBooking(T1, 'res_1', 'user_1', slot1);
    const b2 = bookingEngine.createBooking(T1, 'res_1', 'user_2', slot2);
    expect(b2.status).toBe('confirmed');
  });

  it('should return false when cancelling a non-existent booking', () => {
    const result = bookingEngine.cancelBooking(T1, 'bk_nonexistent');
    expect(result).toBe(false);
  });

  it('should report resource unavailable when booked within a containing slot', () => {
    const outer = {
      startTime: new Date('2026-03-15T09:00:00Z'),
      endTime: new Date('2026-03-15T12:00:00Z'),
    };
    const inner = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    bookingEngine.createBooking(T1, 'res_1', 'user_1', outer);

    expect(() => {
      bookingEngine.createBooking(T1, 'res_1', 'user_2', inner);
    }).toThrow('Resource is not available for the requested time slot');
  });

  it('should check availability without creating a booking', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    expect(bookingEngine.isAvailable(T1, 'res_1', slot)).toBe(true);
    bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);
    expect(bookingEngine.isAvailable(T1, 'res_1', slot)).toBe(false);
  });

  // ─── Cross-Tenant Isolation ───────────────────────────────────────────────

  it('cross-tenant: booking by tenant_A does not block the same slot for tenant_B', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);

    // Same resource and slot for T2 must still be available
    expect(bookingEngine.isAvailable(T2, 'res_1', slot)).toBe(true);
    const b2 = bookingEngine.createBooking(T2, 'res_1', 'user_2', slot);
    expect(b2.status).toBe('confirmed');
    expect(b2.tenantId).toBe(T2);
  });

  it('cross-tenant: cancelBooking by tenant_B cannot cancel tenant_A booking', () => {
    const slot = {
      startTime: new Date('2026-03-15T10:00:00Z'),
      endTime: new Date('2026-03-15T11:00:00Z'),
    };

    const booking = bookingEngine.createBooking(T1, 'res_1', 'user_1', slot);

    // T2 attempts to cancel T1's booking — must return false (not found in T2)
    const result = bookingEngine.cancelBooking(T2, booking.id);
    expect(result).toBe(false);

    // Original booking should still be active (blocking T1's slot)
    expect(bookingEngine.isAvailable(T1, 'res_1', slot)).toBe(false);
  });
});
