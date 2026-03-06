export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  tenantId: string;
  tenants?: TenantInfo[];
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
  login: () => void;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
}
