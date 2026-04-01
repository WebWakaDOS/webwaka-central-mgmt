export function parsePagination(
  q: Record<string, string>,
  maxLimit = 100
): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(q.limit ?? '20', 10) || 20, 1), maxLimit);
  const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
}

export function metaResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
) {
  return {
    data,
    meta: {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}

export function applyTenantScope(
  baseQuery: string,
  params: unknown[],
  tenantId: string,
  column = 'operator_id'
): { query: string; params: unknown[] } {
  const hasWhere = /\bWHERE\b/i.test(baseQuery);
  const clause = hasWhere ? ` AND ${column} = ?` : ` WHERE ${column} = ?`;
  return { query: baseQuery + clause, params: [...params, tenantId] };
}
