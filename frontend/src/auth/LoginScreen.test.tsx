import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';

vi.mock('@aws-amplify/auth', () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  getCurrentUser: vi.fn(),
}));

describe('LoginScreen', () => {
  it('renders email and password fields with submit button', () => {
    render(<LoginScreen onSignIn={() => {}} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connexion/i })).toBeInTheDocument();
  });

  it('shows the app title', () => {
    render(<LoginScreen onSignIn={() => {}} />);
    expect(screen.getByRole('heading', { name: /clos bon accueil/i })).toBeInTheDocument();
  });
});
