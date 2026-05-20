import { randomBytes } from 'crypto';

// Base32 sans ambiguïté visuelle : ni 0/O, ni 1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateBookingReference(): string {
  const bytes = randomBytes(8);
  let ref = 'CLOS-';
  for (let i = 0; i < 8; i++) {
    ref += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return ref;
}
