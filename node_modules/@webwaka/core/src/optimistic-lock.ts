export interface OptimisticLockResult {
  success: boolean;
  conflict: boolean;
  error?: string;
}

export async function updateWithVersionLock(
  db: D1Database,
  table: string,
  updates: Record<string, any>,
  where: { id: string; tenantId: string; expectedVersion: number }
): Promise<OptimisticLockResult> {
  try {
    const now = new Date().toISOString();
    const setClauses = Object.keys(updates)
      .map((col) => `${col} = ?`)
      .join(', ');
    const setValues = Object.values(updates);

    const sql = `
      UPDATE ${table}
      SET ${setClauses}, version = version + 1, updatedAt = ?
      WHERE id = ? AND tenantId = ? AND version = ? AND deletedAt IS NULL
    `;

    const stmt = db.prepare(sql).bind(...setValues, now, where.id, where.tenantId, where.expectedVersion);
    const result = await stmt.run();

    if ((result.meta as any).changes === 0) {
      return { success: false, conflict: true };
    }
    return { success: true, conflict: false };
  } catch (err: any) {
    return { success: false, conflict: false, error: err?.message };
  }
}
