import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeService } from '../../services/theme-service.js';
import type { ThemeStore, ThemeConfig } from '../../services/theme-service.js';

function createMockStore(): ThemeStore & {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

describe('ThemeService', () => {
  let store: ReturnType<typeof createMockStore>;
  let service: ThemeService;

  beforeEach(() => {
    store = createMockStore();
    service = new ThemeService(store);
  });

  it('should return default theme when none configured', async () => {
    store.get.mockResolvedValue(null);

    const theme = await service.getTheme('tenant-1');

    expect(theme).toEqual({
      tenantId: 'tenant-1',
      primaryColor: '#3B82F6',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'R360 Flow',
    });
    expect(store.get).toHaveBeenCalledWith('tenant-1');
  });

  it('should update theme for tenant', async () => {
    store.get.mockResolvedValue(null);
    const savedTheme: ThemeConfig = {
      tenantId: 'tenant-1',
      primaryColor: '#FF0000',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'My Custom App',
    };
    store.save.mockResolvedValue(savedTheme);

    const result = await service.updateTheme('tenant-1', {
      primaryColor: '#FF0000',
      appName: 'My Custom App',
    });

    expect(result).toEqual(savedTheme);
    expect(store.save).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      primaryColor: '#FF0000',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'My Custom App',
    });
  });

  it('should merge updates with existing theme', async () => {
    const existingTheme: ThemeConfig = {
      tenantId: 'tenant-2',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      accentColor: '#0000FF',
      fontFamily: 'Roboto, sans-serif',
      appName: 'Existing App',
      logoUrl: 'https://example.com/logo.png',
    };
    store.get.mockResolvedValue(existingTheme);

    const merged: ThemeConfig = {
      ...existingTheme,
      accentColor: '#FFFF00',
      faviconUrl: 'https://example.com/favicon.ico',
    };
    store.save.mockResolvedValue(merged);

    const result = await service.updateTheme('tenant-2', {
      accentColor: '#FFFF00',
      faviconUrl: 'https://example.com/favicon.ico',
    });

    expect(result).toEqual(merged);
    expect(store.save).toHaveBeenCalledWith({
      tenantId: 'tenant-2',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      accentColor: '#FFFF00',
      fontFamily: 'Roboto, sans-serif',
      appName: 'Existing App',
      logoUrl: 'https://example.com/logo.png',
      faviconUrl: 'https://example.com/favicon.ico',
    });
  });

  it('should reset theme to default', async () => {
    store.delete.mockResolvedValue(true);

    const result = await service.resetToDefault('tenant-3');

    expect(result).toEqual({
      tenantId: 'tenant-3',
      primaryColor: '#3B82F6',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'R360 Flow',
    });
    expect(store.delete).toHaveBeenCalledWith('tenant-3');
  });

  it('should isolate themes per tenant', async () => {
    const tenantATheme: ThemeConfig = {
      tenantId: 'tenant-a',
      primaryColor: '#AA0000',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'Tenant A App',
    };

    const tenantBTheme: ThemeConfig = {
      tenantId: 'tenant-b',
      primaryColor: '#BB0000',
      secondaryColor: '#1E293B',
      accentColor: '#10B981',
      fontFamily: 'Inter, system-ui, sans-serif',
      appName: 'Tenant B App',
    };

    store.get.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'tenant-a') return tenantATheme;
      if (tenantId === 'tenant-b') return tenantBTheme;
      return null;
    });

    const resultA = await service.getTheme('tenant-a');
    const resultB = await service.getTheme('tenant-b');

    expect(resultA.tenantId).toBe('tenant-a');
    expect(resultA.primaryColor).toBe('#AA0000');
    expect(resultA.appName).toBe('Tenant A App');

    expect(resultB.tenantId).toBe('tenant-b');
    expect(resultB.primaryColor).toBe('#BB0000');
    expect(resultB.appName).toBe('Tenant B App');

    expect(resultA).not.toEqual(resultB);
  });
});
