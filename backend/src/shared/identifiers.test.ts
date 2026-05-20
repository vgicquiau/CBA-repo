import { describe, it, expect } from 'vitest';
import { generateBookingReference } from './identifiers';

const ALLOWED_PATTERN = /^CLOS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

describe('generateBookingReference', () => {
  it('starts with CLOS-', () => {
    expect(generateBookingReference()).toMatch(/^CLOS-/);
  });

  it('has total length of 13 characters (CLOS- + 8)', () => {
    expect(generateBookingReference()).toHaveLength(13);
  });

  it('only uses characters from the allowed base32 alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateBookingReference()).toMatch(ALLOWED_PATTERN);
    }
  });

  it('never contains ambiguous characters 0, 1, I, L, O', () => {
    const refs = Array.from({ length: 500 }, () => generateBookingReference());
    for (const ref of refs) {
      const suffix = ref.slice(5);
      expect(suffix).not.toMatch(/[01ILO]/);
    }
  });

  it('generates statistically unique references (1000 samples)', () => {
    const refs = new Set(Array.from({ length: 1000 }, () => generateBookingReference()));
    expect(refs.size).toBe(1000);
  });
});
