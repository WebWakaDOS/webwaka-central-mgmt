import type { D1Database } from '@cloudflare/workers-types';

export interface NdprConsentLog {
  id: string;
  entity_id: string;
  entity_type: string;
  consented_at: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export function assertNdprConsent(body: unknown): void {
  if (
    typeof body !== 'object' ||
    body === null ||
    (body as Record<string, unknown>).ndpr_consent !== true
  ) {
    const err = new Error('NDPR consent is required');
    (err as any).status = 400;
    (err as any).code = 'NDPR_CONSENT_REQUIRED';
    throw err;
  }
}

export async function recordNdprConsent(
  db: D1Database,
  entityId: string,
  entityType: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT OR IGNORE INTO ndpr_consent_log (id, entity_id, entity_type, consented_at, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      `ndpr_${now}_${Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('')}`,
      entityId,
      entityType,
      now,
      ipAddress,
      userAgent,
      now
    )
    .run();
}
