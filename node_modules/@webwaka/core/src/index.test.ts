/**
 * Barrel export coverage test — src/index.ts
 *
 * This file imports from the main entry point to ensure the barrel is
 * exercised by the coverage tool. All actual logic is tested in the
 * individual module test files.
 */
import { describe, it, expect } from 'vitest';
import {
  // Auth
  signJWT,
  verifyJWT,
  jwtAuthMiddleware,
  verifyApiKey,
  requireRole,
  requirePermissions,
  secureCORS,
  rateLimit,
  getTenantId,
  getAuthUser,
  // Tax
  TaxEngine,
  createTaxEngine,
  // Payment
  PaystackProvider,
  createPaymentProvider,
  // SMS
  TermiiProvider,
  createSmsProvider,
  sendTermiiSms,
  // Rate limit (KV standalone)
  checkRateLimit,
  // Optimistic lock
  updateWithVersionLock,
  // PIN
  hashPin,
  verifyPin,
  // AI
  OpenRouterClient,
  createAiClient,
  // Events
  CommerceEvents,
  // Nanoid
  nanoid,
  genId,
  // Query helpers
  parsePagination,
  metaResponse,
  applyTenantScope,
  // NDPR
  assertNdprConsent,
  recordNdprConsent,
} from './index';

describe('@webwaka/core barrel exports', () => {
  it('exports auth functions', () => {
    expect(typeof signJWT).toBe('function');
    expect(typeof verifyJWT).toBe('function');
    expect(typeof jwtAuthMiddleware).toBe('function');
    expect(typeof verifyApiKey).toBe('function');
    expect(typeof requireRole).toBe('function');
    expect(typeof requirePermissions).toBe('function');
    expect(typeof secureCORS).toBe('function');
    expect(typeof rateLimit).toBe('function');
    expect(typeof getTenantId).toBe('function');
    expect(typeof getAuthUser).toBe('function');
  });

  it('exports tax utilities', () => {
    expect(typeof TaxEngine).toBe('function');
    expect(typeof createTaxEngine).toBe('function');
  });

  it('exports payment utilities', () => {
    expect(typeof PaystackProvider).toBe('function');
    expect(typeof createPaymentProvider).toBe('function');
  });

  it('exports SMS utilities', () => {
    expect(typeof TermiiProvider).toBe('function');
    expect(typeof createSmsProvider).toBe('function');
    expect(typeof sendTermiiSms).toBe('function');
  });

  it('exports rate limit utility', () => {
    expect(typeof checkRateLimit).toBe('function');
  });

  it('exports optimistic lock utility', () => {
    expect(typeof updateWithVersionLock).toBe('function');
  });

  it('exports PIN utilities', () => {
    expect(typeof hashPin).toBe('function');
    expect(typeof verifyPin).toBe('function');
  });

  it('exports AI client', () => {
    expect(typeof OpenRouterClient).toBe('function');
    expect(typeof createAiClient).toBe('function');
  });

  it('exports CommerceEvents', () => {
    expect(CommerceEvents).toBeDefined();
    expect(CommerceEvents.ORDER_CREATED).toBe('order.created');
  });

  it('exports nanoid utilities', () => {
    expect(typeof nanoid).toBe('function');
    expect(typeof genId).toBe('function');
  });

  it('exports query helpers', () => {
    expect(typeof parsePagination).toBe('function');
    expect(typeof metaResponse).toBe('function');
    expect(typeof applyTenantScope).toBe('function');
  });

  it('exports NDPR utilities', () => {
    expect(typeof assertNdprConsent).toBe('function');
    expect(typeof recordNdprConsent).toBe('function');
  });
});
