/**
 * CORE-6: Universal RBAC & Permissions Engine
 * Blueprint Reference: Part 2 Layer 4 (Tenant Resolution & Auth)
 * 
 * Implements granular role definitions and Hono middleware for route protection.
 */

import { Context, Next } from 'hono';

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER'
}

export interface UserSession {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: string[];
}

/**
 * Middleware to enforce role-based access control on routes.
 * @param allowedRoles Array of roles permitted to access the route.
 */
export const requireRole = (allowedRoles: Role[]) => {
  return async (c: Context, next: Next) => {
    const session = c.get('session') as UserSession | undefined;

    if (!session) {
      return c.json({ error: 'Unauthorized: No session found' }, 401);
    }

    if (!allowedRoles.includes(session.role)) {
      return c.json({ error: `Forbidden: Requires one of ${allowedRoles.join(', ')}` }, 403);
    }

    await next();
  };
};

/**
 * Middleware to enforce specific permissions.
 * @param requiredPermissions Array of permissions required to access the route.
 */
export const requirePermissions = (requiredPermissions: string[]) => {
  return async (c: Context, next: Next) => {
    const session = c.get('session') as UserSession | undefined;

    if (!session) {
      return c.json({ error: 'Unauthorized: No session found' }, 401);
    }

    // Super Admin bypasses permission checks
    if (session.role === Role.SUPER_ADMIN) {
      await next();
      return;
    }

    const hasAllPermissions = requiredPermissions.every(p => session.permissions.includes(p));

    if (!hasAllPermissions) {
      return c.json({ error: `Forbidden: Missing required permissions` }, 403);
    }

    await next();
  };
};

/**
 * Utility to verify JWT and extract session (Mock implementation for now)
 * In production, this would verify the JWT signature against Cloudflare Access or custom auth.
 */
export const verifyJwt = async (token: string): Promise<UserSession | null> => {
  // Mock implementation
  if (token === 'mock-super-admin-token') {
    return { userId: 'sa-1', tenantId: 'platform', role: Role.SUPER_ADMIN, permissions: ['*'] };
  }
  if (token === 'mock-tenant-admin-token') {
    return { userId: 'ta-1', tenantId: 'tenant-1', role: Role.TENANT_ADMIN, permissions: ['manage_users', 'view_reports'] };
  }
  return null;
};
