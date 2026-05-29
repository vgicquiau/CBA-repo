import type { PublicClientApplication } from '@azure/msal-browser';

let _instance: PublicClientApplication | null = null;

export function setMsalInstance(instance: PublicClientApplication): void {
  _instance = instance;
}

export function getMsalInstance(): PublicClientApplication {
  if (!_instance) throw new Error('MSAL not initialized — AuthProvider must mount first');
  return _instance;
}
