import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthGuard } from '../auth-guard';
import type { AuthState } from '../types';

// ---------------------------------------------------------------------------
// Mock useAuth hook
// ---------------------------------------------------------------------------

const mockAuthState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  switchTenant: vi.fn(),
};

vi.mock('../use-auth', () => ({
  useAuth: () => mockAuthState,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setAuthState(overrides: Partial<AuthState>) {
  Object.assign(mockAuthState, {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    token: null,
    error: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthGuard', () => {
  beforeEach(() => {
    setAuthState({});
  });

  it('shows loading indicator when auth state is loading', () => {
    setAuthState({ isLoading: true });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Loading...')).toBeDefined();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('shows sign-in prompt when user is not authenticated', () => {
    setAuthState({ isAuthenticated: false, isLoading: false });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );

    expect(screen.getByText('Sign in required')).toBeDefined();
    expect(screen.getByText('Please sign in to access the workflow editor.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders children when user is authenticated', () => {
    setAuthState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-1',
      },
      token: 'valid-token',
    });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );

    expect(screen.getByText('Protected content')).toBeDefined();
    expect(screen.queryByText('Sign in required')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sign-in button redirects to login page', () => {
    setAuthState({ isAuthenticated: false, isLoading: false });

    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );

    screen.getByRole('button', { name: 'Sign In' }).click();
    expect(window.location.href).toBe('/auth/login');

    // Restore
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });
});
