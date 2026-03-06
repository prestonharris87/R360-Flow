import { type ReactNode } from 'react';
import { useAuth } from './use-auth';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div role="status" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1rem' }}>
        <h2>Sign in required</h2>
        <p>Please sign in to access the workflow editor.</p>
        <button onClick={() => window.location.href = '/auth/login'} type="button">
          Sign In
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
