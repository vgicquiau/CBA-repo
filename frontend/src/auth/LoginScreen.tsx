import { useState } from 'react';
import { signIn, confirmSignIn, getCurrentUser } from '@aws-amplify/auth';
import type { AuthUser } from '@aws-amplify/auth';

interface LoginScreenProps {
  onSignIn: (user: AuthUser) => void;
}

function humanizeError(err: unknown): string {
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAuthorizedException':
        return 'Email ou mot de passe incorrect.';
      case 'UserNotFoundException':
        return 'Compte introuvable.';
      case 'UserNotConfirmedException':
        return 'Votre compte n\'est pas encore confirmé.';
      case 'PasswordResetRequiredException':
        return 'Veuillez réinitialiser votre mot de passe.';
      default:
        return err.message;
    }
  }
  return 'Une erreur est survenue.';
}

export function LoginScreen({ onSignIn }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { isSignedIn, nextStep } = await signIn({ username: email, password });
      if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setNeedsNewPassword(true);
      } else if (isSignedIn) {
        const user = await getCurrentUser();
        onSignIn(user);
      }
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmNewPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setIsLoading(true);
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      const user = await getCurrentUser();
      onSignIn(user);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setIsLoading(false);
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--ink-2, #4A3E2E)',
    marginBottom: 6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--line, rgba(42,34,24,0.12))',
    borderRadius: 8,
    background: 'white',
    fontSize: 15,
    color: 'var(--ink, #2A2218)',
    boxSizing: 'border-box',
    marginBottom: 20,
    outline: 'none',
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

  if (needsNewPassword) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Nouveau mot de passe</h1>
          <p style={subtitleStyle}>Définissez votre mot de passe personnel pour continuer.</p>
          {error && <div style={errorStyle} role="alert">{error}</div>}
          <form onSubmit={handleNewPassword} noValidate>
            <label htmlFor="new-password" style={labelStyle}>Nouveau mot de passe</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              style={inputStyle}
              autoComplete="new-password"
            />
            <label htmlFor="confirm-password" style={labelStyle}>Confirmer le mot de passe</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              style={inputStyle}
              autoComplete="new-password"
            />
            <button type="submit" disabled={isLoading} style={btnStyle}>
              {isLoading ? 'Enregistrement…' : 'Définir le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Le Clos Bon Accueil</h1>
        <p style={subtitleStyle}>Connectez-vous pour accéder à votre espace.</p>
        {error && <div style={errorStyle} role="alert">{error}</div>}
        <form onSubmit={handleSignIn} noValidate>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            autoComplete="email"
            autoFocus
          />
          <label htmlFor="password" style={labelStyle}>Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
            autoComplete="current-password"
          />
          <button type="submit" disabled={isLoading} style={btnStyle}>
            {isLoading ? 'Connexion…' : 'Connexion'}
          </button>
        </form>
      </div>
    </div>
  );
}
