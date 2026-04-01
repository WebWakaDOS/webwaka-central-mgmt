import { describe, it, expect } from 'vitest';
import { CommerceEvents } from './events';
import type { CommerceEventType } from './events';

describe('CommerceEvents', () => {
  it('exports all expected event constants', () => {
    expect(CommerceEvents.INVENTORY_UPDATED).toBe('inventory.updated');
    expect(CommerceEvents.ORDER_CREATED).toBe('order.created');
    expect(CommerceEvents.ORDER_READY_DELIVERY).toBe('order.ready_for_delivery');
    expect(CommerceEvents.PAYMENT_COMPLETED).toBe('payment.completed');
    expect(CommerceEvents.PAYMENT_REFUNDED).toBe('payment.refunded');
    expect(CommerceEvents.SHIFT_CLOSED).toBe('shift.closed');
    expect(CommerceEvents.CART_ABANDONED).toBe('cart.abandoned');
    expect(CommerceEvents.SUBSCRIPTION_CHARGE).toBe('subscription.charge_due');
    expect(CommerceEvents.DELIVERY_QUOTE).toBe('delivery.quote');
    expect(CommerceEvents.DELIVERY_STATUS).toBe('delivery.status_changed');
    expect(CommerceEvents.VENDOR_KYC_SUBMITTED).toBe('vendor.kyc_submitted');
    expect(CommerceEvents.VENDOR_KYC_APPROVED).toBe('vendor.kyc_approved');
    expect(CommerceEvents.VENDOR_KYC_REJECTED).toBe('vendor.kyc_rejected');
    expect(CommerceEvents.STOCK_ADJUSTED).toBe('stock.adjusted');
    expect(CommerceEvents.DISPUTE_OPENED).toBe('dispute.opened');
    expect(CommerceEvents.DISPUTE_RESOLVED).toBe('dispute.resolved');
    expect(CommerceEvents.PURCHASE_ORDER_RECEIVED).toBe('purchase_order.received');
    expect(CommerceEvents.FLASH_SALE_STARTED).toBe('flash_sale.started');
    expect(CommerceEvents.FLASH_SALE_ENDED).toBe('flash_sale.ended');
  });

  it('has 19 event types', () => {
    expect(Object.keys(CommerceEvents)).toHaveLength(19);
  });

  it('all event values are dot-separated strings', () => {
    for (const value of Object.values(CommerceEvents)) {
      expect(value).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('CommerceEventType is assignable from event values', () => {
    // Type-level test — if this compiles, the type is correct
    const event: CommerceEventType = CommerceEvents.ORDER_CREATED;
    expect(event).toBe('order.created');
  });
});
