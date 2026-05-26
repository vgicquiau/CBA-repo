import { AuthProvider } from './auth/AuthProvider';

export function App() {
  return (
    <AuthProvider>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg, #F5EFE5)',
          color: 'var(--ink, #2A2218)',
          fontFamily: 'var(--sans, sans-serif)',
          fontSize: 16,
        }}
      >
        Connecté — routes P10
      </div>
    </AuthProvider>
  );
}
