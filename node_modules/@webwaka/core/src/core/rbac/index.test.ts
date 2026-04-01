import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireRole, requirePermissions, Role, UserSession } from './index';
import { Context } from 'hono';

describe('CORE-6: Universal RBAC & Permissions Engine', () => {
  
  const createMockContext = (session?: UserSession): Context => {
    return {
      get: vi.fn().mockReturnValue(session),
      json: vi.fn().mockReturnValue('json-response')
    } as unknown as Context;
  };

  let mockNext = vi.fn();

  beforeEach(() => {
    mockNext = vi.fn();
  });

  describe('requireRole middleware', () => {
    it('should allow access if user has required role', async () => {
      const c = createMockContext({ userId: '1', tenantId: 't1', role: Role.TENANT_ADMIN, permissions: [] });
      const middleware = requireRole([Role.TENANT_ADMIN, Role.SUPER_ADMIN]);
      
      await middleware(c, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(c.json).not.toHaveBeenCalled();
    });

    it('should deny access if user lacks required role', async () => {
      const c = createMockContext({ userId: '1', tenantId: 't1', role: Role.CUSTOMER, permissions: [] });
      const middleware = requireRole([Role.TENANT_ADMIN]);
      
      await middleware(c, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({ error: 'Forbidden: Requires one of TENANT_ADMIN' }, 403);
    });

    it('should deny access if no session exists', async () => {
      const c = createMockContext(undefined);
      const middleware = requireRole([Role.TENANT_ADMIN]);
      
      await middleware(c, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized: No session found' }, 401);
    });
  });

  describe('requirePermissions middleware', () => {
    it('should allow access if user has all required permissions', async () => {
      const c = createMockContext({ userId: '1', tenantId: 't1', role: Role.STAFF, permissions: ['read:users', 'write:users'] });
      const middleware = requirePermissions(['read:users']);
      
      await middleware(c, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access if user is missing a required permission', async () => {
      const c = createMockContext({ userId: '1', tenantId: 't1', role: Role.STAFF, permissions: ['read:users'] });
      const middleware = requirePermissions(['read:users', 'write:users']);
      
      await middleware(c, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({ error: 'Forbidden: Missing required permissions' }, 403);
    });

    it('should always allow SUPER_ADMIN regardless of explicit permissions', async () => {
      const c = createMockContext({ userId: '1', tenantId: 'platform', role: Role.SUPER_ADMIN, permissions: [] });
      const middleware = requirePermissions(['some:obscure:permission']);
      
      await middleware(c, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
