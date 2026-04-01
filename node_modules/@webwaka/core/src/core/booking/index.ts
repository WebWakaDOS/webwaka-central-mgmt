/**
 * CORE-10: Universal Booking & Scheduling Engine
 * Blueprint Reference: Part 10.3 (Transport), Part 10.7 (Health)
 *
 * Unified system for managing time slots, availability, and reservations.
 *
 * Tenant Isolation: every mutating and querying method requires a tenantId.
 * All data is scoped per tenant — cross-tenant leakage is impossible by construction.
 */

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
}

export interface Booking {
  id: string;
  tenantId: string;
  resourceId: string;
  userId: string;
  slot: TimeSlot;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export class BookingEngine {
  private bookings: Booking[] = [];

  /**
   * Checks if a resource is available for a given time slot within a tenant.
   */
  isAvailable(tenantId: string, resourceId: string, requestedSlot: TimeSlot): boolean {
    const resourceBookings = this.bookings.filter(b =>
      b.tenantId === tenantId &&
      b.resourceId === resourceId &&
      b.status !== 'cancelled'
    );

    for (const booking of resourceBookings) {
      if (
        requestedSlot.startTime < booking.slot.endTime &&
        requestedSlot.endTime > booking.slot.startTime
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Creates a new booking if the resource is available within the tenant.
   */
  createBooking(tenantId: string, resourceId: string, userId: string, slot: TimeSlot): Booking {
    if (!this.isAvailable(tenantId, resourceId, slot)) {
      throw new Error('Resource is not available for the requested time slot');
    }

    const newBooking: Booking = {
      id: `bk_${crypto.randomUUID()}`,
      tenantId,
      resourceId,
      userId,
      slot,
      status: 'confirmed',
    };

    this.bookings.push(newBooking);

    // eventBus.publish(WebWakaEventType.BOOKING_CONFIRMED, createEvent(WebWakaEventType.BOOKING_CONFIRMED, tenantId, newBooking));

    return newBooking;
  }

  /**
   * Cancels an existing booking, scoped to the tenant.
   * Returns false if the booking does not exist within the tenant.
   */
  cancelBooking(tenantId: string, bookingId: string): boolean {
    const booking = this.bookings.find(
      b => b.id === bookingId && b.tenantId === tenantId
    );
    if (booking) {
      booking.status = 'cancelled';

      // eventBus.publish(WebWakaEventType.BOOKING_CANCELLED, createEvent(WebWakaEventType.BOOKING_CANCELLED, tenantId, booking));

      return true;
    }
    return false;
  }
}
