import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: { loginRedirect: vi.fn() } }),
}));

describe('LoginScreen', () => {
  it('renders title and login button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('heading', { name: /clos bon accueil/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connexion/i })).toBeInTheDocument();
  });
});
