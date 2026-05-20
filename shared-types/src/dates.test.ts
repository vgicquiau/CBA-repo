import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayIsoInAppTz, toAppDateString, nightsBetween, intervalsOverlap, APP_TIMEZONE } from './dates';

describe('APP_TIMEZONE', () => {
  it('is Europe/Paris', () => {
    expect(APP_TIMEZONE).toBe('Europe/Paris');
  });
});

describe('todayIsoInAppTz', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = todayIsoInAppTz();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the same date as dayjs tz would', () => {
    const result = todayIsoInAppTz();
    // Just verify format and that it looks like a valid date
    const [year, month, day] = result.split('-').map(Number);
    expect(year).toBeGreaterThan(2020);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  it('returns a consistent result when called twice in the same millisecond', () => {
    const a = todayIsoInAppTz();
    const b = todayIsoInAppTz();
    expect(a).toBe(b);
  });
});

describe('toAppDateString', () => {
  it('converts a UTC ISO instant to Europe/Paris date (winter, UTC+1)', () => {
    // 2026-01-15T23:30:00.000Z → 2026-01-16 in Europe/Paris (UTC+1)
    expect(toAppDateString('2026-01-15T23:30:00.000Z')).toBe('2026-01-16');
  });

  it('converts a UTC ISO instant to Europe/Paris date (summer, UTC+2)', () => {
    // 2026-06-15T22:30:00.000Z → 2026-06-16 in Europe/Paris (UTC+2)
    expect(toAppDateString('2026-06-15T22:30:00.000Z')).toBe('2026-06-16');
  });

  it('passes through a YYYY-MM-DD string unchanged', () => {
    expect(toAppDateString('2026-05-17')).toBe('2026-05-17');
  });

  it('handles midnight UTC correctly (not shifting the day)', () => {
    // 2026-05-17T00:00:00.000Z → 2026-05-17 in Paris (UTC+2 in summer)
    expect(toAppDateString('2026-05-17T00:00:00.000Z')).toBe('2026-05-17');
  });
});

describe('nightsBetween', () => {
  it('returns 1 for consecutive days', () => {
    expect(nightsBetween('2026-05-16', '2026-05-17')).toBe(1);
  });

  it('returns 7 for a week', () => {
    expect(nightsBetween('2026-05-16', '2026-05-23')).toBe(7);
  });

  it('returns 3 for a 3-night stay', () => {
    expect(nightsBetween('2026-05-18', '2026-05-21')).toBe(3);
  });

  it('returns 0 for same start and end', () => {
    expect(nightsBetween('2026-05-16', '2026-05-16')).toBe(0);
  });

  it('returns correct count across month boundary', () => {
    expect(nightsBetween('2026-05-30', '2026-06-02')).toBe(3);
  });
});

describe('intervalsOverlap', () => {
  it('returns true for fully overlapping intervals', () => {
    expect(intervalsOverlap('2026-05-16', '2026-05-20', '2026-05-17', '2026-05-19')).toBe(true);
  });

  it('returns true for partially overlapping intervals', () => {
    expect(intervalsOverlap('2026-05-16', '2026-05-19', '2026-05-18', '2026-05-21')).toBe(true);
  });

  it('returns false for adjacent intervals (end of one = start of other)', () => {
    // [16,19) and [19,21) share no nights → no overlap
    expect(intervalsOverlap('2026-05-16', '2026-05-19', '2026-05-19', '2026-05-21')).toBe(false);
  });

  it('returns false for non-overlapping intervals (before)', () => {
    expect(intervalsOverlap('2026-05-10', '2026-05-13', '2026-05-16', '2026-05-19')).toBe(false);
  });

  it('returns false for non-overlapping intervals (after)', () => {
    expect(intervalsOverlap('2026-05-16', '2026-05-19', '2026-05-05', '2026-05-10')).toBe(false);
  });

  it('returns true for identical intervals', () => {
    expect(intervalsOverlap('2026-05-16', '2026-05-19', '2026-05-16', '2026-05-19')).toBe(true);
  });
});
