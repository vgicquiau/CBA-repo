import { useState } from 'react';
import { useMsal } from '@azure/msal-react';

export function LoginScreen() {
  const { instance } = useMsal();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await instance.loginRedirect({ scopes: ['openid', 'profile', 'email'] });
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--bg, #F5EFE5)',
    fontFamily: 'var(--sans, sans-serif)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--paper, #FBF7F0)',
    borderRadius: 16,
    padding: '40px 32px',
    width: '100%',
    maxWidth: 360,
    boxSizing: 'border-box',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: 'var(--serif, Georgia, serif)',
    fontSize: 26,
    color: 'var(--ink, #2A2218)',
    marginBottom: 8,
    fontWeight: 400,
  };

  const subtitleStyle: React.CSSProperties = {
    color: 'var(--muted, #8A7D6B)',
    fontSize: 14,
    marginBottom: 32,
  };

  const btnStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'var(--terracotta, #B05A3C)',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    opacity: isLoading ? 0.7 : 1,
    fontFamily: 'var(--sans, sans-serif)',
  };

  const errorStyle: React.CSSProperties = {
    background: '#FDE8E4',
    color: 'var(--terracotta, #B05A3C)',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Le Clos Bon Accueil</h1>
        <p style={subtitleStyle}>Connectez-vous pour accéder à votre espace.</p>
        {error && <div style={errorStyle} role="alert">{error}</div>}
        <button
          onClick={() => { void handleLogin(); }}
          disabled={isLoading}
          style={btnStyle}
        >
          {isLoading ? 'Redirection…' : 'Connexion'}
        </button>
      </div>
    </div>
  );
}
