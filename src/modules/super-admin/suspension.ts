/**
 * Tenant Suspension Hook
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Phase 2 — Security & Fraud
 *
 * Automatically suspends or unsuspends tenants and logs every action to the
 * immutable `tenant_suspension_log` table.
 *
 * Suspension updates the KV tenant config (`status: 'suspended'`) so that
 * all downstream services reading the config will respect the suspension.
 */

export interface SuspensionResult {
  tenantId: string;
  action: 'suspend' | 'unsuspend';
  reason: string;
  logId: string;
}

/**
 * Suspend a tenant.
 * Updates KV config to `status: 'suspended'` and writes an audit log entry.
 * Safe to call if the tenant is already suspended (idempotent KV update).
 */
export async function suspendTenant(
  kv: KVNamespace,
  db: D1Database,
  tenantId: string,
  reason: string,
  suspendedBy: string = 'system',
): Promise<SuspensionResult> {
  // Update KV tenant config
  const raw = await kv.get(`tenant:${tenantId}`);
  if (raw) {
    const config = JSON.parse(raw);
    config.status = 'suspended';
    config.suspendedAt = Date.now();
    config.suspensionReason = reason;
    await kv.put(`tenant:${tenantId}`, JSON.stringify(config));
  } else {
    // Create a minimal stub so downstream checks work even without prior provisioning
    await kv.put(
      `tenant:${tenantId}`,
      JSON.stringify({
        tenantId,
        status: 'suspended',
        suspendedAt: Date.now(),
        suspensionReason: reason,
        enabledModules: [],
        featureFlags: {},
      }),
    );
  }

  // Write immutable audit log
  const logId = `susp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .prepare(
      `INSERT INTO tenant_suspension_log
         (id, tenant_id, action, reason, suspended_by, created_at)
       VALUES (?, ?, 'suspend', ?, ?, ?)`,
    )
    .bind(logId, tenantId, reason, suspendedBy, Date.now())
    .run();

  return { tenantId, action: 'suspend', reason, logId };
}

/**
 * Unsuspend (reinstate) a tenant.
 * Resets KV config to `status: 'active'` and writes an audit log entry.
 */
export async function unsuspendTenant(
  kv: KVNamespace,
  db: D1Database,
  tenantId: string,
  reason: string,
  unsuspendedBy: string = 'system',
): Promise<SuspensionResult> {
  const raw = await kv.get(`tenant:${tenantId}`);
  if (raw) {
    const config = JSON.parse(raw);
    config.status = 'active';
    delete config.suspendedAt;
    delete config.suspensionReason;
    await kv.put(`tenant:${tenantId}`, JSON.stringify(config));
  }

  const logId = `unsusp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .prepare(
      `INSERT INTO tenant_suspension_log
         (id, tenant_id, action, reason, suspended_by, created_at)
       VALUES (?, ?, 'unsuspend', ?, ?, ?)`,
    )
    .bind(logId, tenantId, reason, unsuspendedBy, Date.now())
    .run();

  return { tenantId, action: 'unsuspend', reason, logId };
}

/**
 * Check whether a tenant is currently suspended.
 * Returns false if the tenant has no KV record (treat as active by default).
 */
export async function isTenantSuspended(
  kv: KVNamespace,
  tenantId: string,
): Promise<boolean> {
  const raw = await kv.get(`tenant:${tenantId}`);
  if (!raw) return false;
  try {
    const config = JSON.parse(raw);
    return config.status === 'suspended';
  } catch {
    return false;
  }
}

/**
 * Fetch the suspension audit log for a tenant.
 */
export async function getTenantSuspensionLog(
  db: D1Database,
  tenantId: string,
  limit = 50,
): Promise<Array<{
  id: string;
  action: string;
  reason: string;
  suspended_by: string;
  created_at: number;
}>> {
  const { results } = await db
    .prepare(
      `SELECT id, action, reason, suspended_by, created_at
       FROM tenant_suspension_log
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(tenantId, limit)
    .all();

  return results as Array<{
    id: string;
    action: string;
    reason: string;
    suspended_by: string;
    created_at: number;
  }>;
}
