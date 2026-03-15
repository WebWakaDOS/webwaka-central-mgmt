import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminService, TenantConfig } from './core';

describe('MGMT-1: Super Admin Dashboard Core Logic', () => {
  let superAdminService: SuperAdminService;
  let mockKv: any;
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    mockKv = {
      get: vi.fn(async (key: string) => mockStore[key] || null),
      put: vi.fn(async (key: string, value: string) => {
        mockStore[key] = value;
      })
    };
    
    superAdminService = new SuperAdminService(mockKv);
  });

  it('should provision a new tenant', async () => {
    const tenant = await superAdminService.provisionTenant('Test Tenant', ['pos', 'single-vendor']);

    expect(tenant.name).toBe('Test Tenant');
    expect(tenant.status).toBe('active');
    expect(tenant.enabledModules).toContain('pos');
    expect(tenant.enabledModules).toContain('single-vendor');
    expect(tenant.featureFlags['ai_assistant']).toBe(true);
    
    expect(mockKv.put).toHaveBeenCalledTimes(1);
    expect(mockStore[`tenant:${tenant.tenantId}`]).toBeDefined();
  });

  it('should toggle a module for an existing tenant', async () => {
    const tenant = await superAdminService.provisionTenant('Test Tenant', ['pos']);
    
    const updatedTenant = await superAdminService.toggleModule(tenant.tenantId, 'multi-vendor', true);
    expect(updatedTenant.enabledModules).toContain('multi-vendor');
    expect(updatedTenant.enabledModules).toContain('pos');

    const disabledTenant = await superAdminService.toggleModule(tenant.tenantId, 'pos', false);
    expect(disabledTenant.enabledModules).not.toContain('pos');
    expect(disabledTenant.enabledModules).toContain('multi-vendor');
  });

  it('should toggle a feature flag for an existing tenant', async () => {
    const tenant = await superAdminService.provisionTenant('Test Tenant');
    
    const updatedTenant = await superAdminService.toggleFeatureFlag(tenant.tenantId, 'advanced_analytics', true);
    expect(updatedTenant.featureFlags['advanced_analytics']).toBe(true);

    const disabledTenant = await superAdminService.toggleFeatureFlag(tenant.tenantId, 'ai_assistant', false);
    expect(disabledTenant.featureFlags['ai_assistant']).toBe(false);
  });

  it('should throw error when toggling module for non-existent tenant', async () => {
    await expect(
      superAdminService.toggleModule('invalid-id', 'pos', true)
    ).rejects.toThrow('Tenant invalid-id not found');
  });
});
