/**
 * MGMT-1: Super Admin Dashboard Core Logic
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 * 
 * Handles tenant provisioning and feature toggling via KV updates.
 */

export interface TenantConfig {
  tenantId: string;
  name: string;
  status: 'active' | 'suspended' | 'pending';
  enabledModules: string[];
  featureFlags: Record<string, boolean>;
  createdAt: Date;
}

export class SuperAdminService {
  private kv: any; // Type would be KVNamespace from @cloudflare/workers-types

  constructor(kv: any) {
    this.kv = kv;
  }

  /**
   * Provisions a new tenant with default modules and feature flags.
   */
  async provisionTenant(name: string, initialModules: string[] = []): Promise<TenantConfig> {
    const tenantId = `tenant_${crypto.randomUUID().split('-')[0]}`;
    
    const config: TenantConfig = {
      tenantId,
      name,
      status: 'active',
      enabledModules: initialModules,
      featureFlags: {
        'ai_assistant': true,
        'advanced_analytics': false
      },
      createdAt: new Date()
    };

    await this.kv.put(`tenant:${tenantId}`, JSON.stringify(config));
    return config;
  }

  /**
   * Toggles a specific module for a tenant.
   */
  async toggleModule(tenantId: string, moduleName: string, enable: boolean): Promise<TenantConfig> {
    const data = await this.kv.get(`tenant:${tenantId}`);
    if (!data) throw new Error(`Tenant ${tenantId} not found`);

    const config: TenantConfig = JSON.parse(data);
    
    if (enable && !config.enabledModules.includes(moduleName)) {
      config.enabledModules.push(moduleName);
    } else if (!enable) {
      config.enabledModules = config.enabledModules.filter(m => m !== moduleName);
    }

    await this.kv.put(`tenant:${tenantId}`, JSON.stringify(config));
    return config;
  }

  /**
   * Toggles a specific feature flag for a tenant.
   */
  async toggleFeatureFlag(tenantId: string, flagName: string, enable: boolean): Promise<TenantConfig> {
    const data = await this.kv.get(`tenant:${tenantId}`);
    if (!data) throw new Error(`Tenant ${tenantId} not found`);

    const config: TenantConfig = JSON.parse(data);
    config.featureFlags[flagName] = enable;

    await this.kv.put(`tenant:${tenantId}`, JSON.stringify(config));
    return config;
  }
}
