import { createContext, useContext, useEffect, useState } from 'react';
import { Amplify } from '@aws-amplify/core';
import { getCurrentUser, signOut as amplifySignOut } from '@aws-amplify/auth';
import type { AuthUser } from '@aws-amplify/auth';
import { loadConfig } from '../config';
import { LoginScreen } from './LoginScreen';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const cfg = await loadConfig();
        Amplify.configure({
          Auth: {
            Cognito: {
              userPoolId: cfg.userPoolId,
              userPoolClientId: cfg.userPoolClientId,
            },
          },
        });
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    void init();
  }, []);

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg, #F5EFE5)',
          color: 'var(--muted, #8A7D6B)',
          fontFamily: 'var(--sans, sans-serif)',
          fontSize: 15,
        }}
      >
        Chargement…
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSignIn={setUser} />;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
