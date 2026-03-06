export interface ThemeConfig {
  tenantId: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  appName: string;
  faviconUrl?: string;
}

const DEFAULT_THEME: Omit<ThemeConfig, 'tenantId'> = {
  primaryColor: '#3B82F6',
  secondaryColor: '#1E293B',
  accentColor: '#10B981',
  fontFamily: 'Inter, system-ui, sans-serif',
  appName: 'R360 Flow',
};

export interface ThemeStore {
  get(tenantId: string): Promise<ThemeConfig | null>;
  save(theme: ThemeConfig): Promise<ThemeConfig>;
  delete(tenantId: string): Promise<boolean>;
}

export class ThemeService {
  constructor(private store: ThemeStore) {}

  async getTheme(tenantId: string): Promise<ThemeConfig> {
    const theme = await this.store.get(tenantId);
    return theme ?? { ...DEFAULT_THEME, tenantId };
  }

  async updateTheme(
    tenantId: string,
    updates: Partial<Omit<ThemeConfig, 'tenantId'>>,
  ): Promise<ThemeConfig> {
    const current = await this.getTheme(tenantId);
    const updated: ThemeConfig = { ...current, ...updates, tenantId };
    return this.store.save(updated);
  }

  async resetToDefault(tenantId: string): Promise<ThemeConfig> {
    await this.store.delete(tenantId);
    return { ...DEFAULT_THEME, tenantId };
  }
}
