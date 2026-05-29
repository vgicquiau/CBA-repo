import { createContext, useContext, useEffect, useState } from 'react';
import { PublicClientApplication, InteractionStatus } from '@azure/msal-browser';
import type { AccountInfo } from '@azure/msal-browser';
import { MsalProvider, useMsal } from '@azure/msal-react';
import { loadConfig } from '../config';
import { setMsalInstance } from './msalInstance';
import { LoginScreen } from './LoginScreen';

interface AuthContextValue {
  user: AccountInfo | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function LoadingDiv() {
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

function AuthGate({ children }: { children: React.ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const account = accounts[0] ?? null;

  const signOut = async () => {
    await instance.logoutRedirect({ account: account ?? undefined });
  };

  if (inProgress !== InteractionStatus.None) {
    return <LoadingDiv />;
  }

  if (!account) {
    return <LoginScreen />;
  }

  return (
    <AuthContext.Provider value={{ user: account, isLoading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [msalInstance, setMsalInstanceState] = useState<PublicClientApplication | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const cfg = await loadConfig();
        const pca = new PublicClientApplication({
          auth: {
            clientId: cfg.clientId,
            authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
            redirectUri: window.location.origin,
            postLogoutRedirectUri: window.location.origin,
          },
          cache: {
            cacheLocation: 'sessionStorage',
            storeAuthStateInCookie: false,
          },
        });
        await pca.initialize();
        setMsalInstance(pca);
        setMsalInstanceState(pca);
      } catch (err) {
        console.error('[AuthProvider] MSAL initialization failed:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    void init();
  }, []);

  if (isInitializing || !msalInstance) return <LoadingDiv />;

  return (
    <MsalProvider instance={msalInstance}>
      <AuthGate>{children}</AuthGate>
    </MsalProvider>
  );
}
