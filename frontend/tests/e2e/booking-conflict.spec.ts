/**
 * Scenario 3 — Conflict:
 *   create booking A → attempt overlapping booking B on same room → expect 409 error UI
 *
 * Uses storageState from auth.setup.ts (already authenticated as guest).
 * Cleans up booking A at the end so the test is idempotent.
 */
import { test, expect } from '@playwright/test';

// Booking A: 2027-09-01 → 2027-09-05
// Booking B: 2027-09-03 → 2027-09-07  (overlaps A by 2 nights)
const START_A = '2027-09-01';
const END_A   = '2027-09-05';
const START_B = '2027-09-03';
const END_B   = '2027-09-07';
const NAME_A  = 'Conflit E2E — A';
const NAME_B  = 'Conflit E2E — B';

test('conflict: overlapping booking attempt shows 409 error', async ({ page }) => {
  // ── 1. Navigate to rooms and remember the first room URL ──────────────────
  await page.goto('/rooms');
  await expect(page.getByText(/chambres, du grenier/)).toBeVisible({ timeout: 15000 });

  // Room names use <span class="serif"> inside clickable cards
  await page.locator('span.serif').first().click();
  await page.waitForURL(/\/rooms\/.+/);
  const roomUrl = page.url();

  // ── 2. Create booking A ───────────────────────────────────────────────────
  await page.getByRole('button', { name: /Réserver/ }).click();
  await page.locator('input[placeholder="Prénom Nom"]').fill(NAME_A);
  const datesA = page.locator('input[type="date"]');
  await datesA.nth(0).fill(START_A);
  await datesA.nth(1).fill(END_A);
  await page.getByRole('button', { name: 'Confirmer la réservation' }).click();
  await expect(page.getByText('Réservation envoyée !')).toBeVisible({ timeout: 15000 });

  // ── 3. Go back to the same room ───────────────────────────────────────────
  await page.goto(roomUrl);
  await expect(page.getByRole('button', { name: /Réserver/ })).toBeVisible({ timeout: 15000 });

  // ── 4. Attempt conflicting booking B ─────────────────────────────────────
  await page.getByRole('button', { name: /Réserver/ }).click();
  await page.locator('input[placeholder="Prénom Nom"]').fill(NAME_B);
  const datesB = page.locator('input[type="date"]');
  await datesB.nth(0).fill(START_B);
  await datesB.nth(1).fill(END_B);
  await page.getByRole('button', { name: 'Confirmer la réservation' }).click();

  // ── 5. Verify 409 conflict error message ─────────────────────────────────
  await expect(page.getByText(/Conflit de dates/)).toBeVisible({ timeout: 10000 });

  // ── 6. Cleanup: cancel booking A via "Mes séjours" ────────────────────────
  await page.locator('.sidebar-label', { hasText: 'Mes séjours' }).click();
  await page.waitForURL('**/my-trips');

  const bookingRow = page.locator('.row-tap').filter({ hasText: NAME_A });
  await expect(bookingRow).toBeVisible({ timeout: 10000 });
  await bookingRow.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Annuler ce séjour ?')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler le séjour' }).click();

  await expect(bookingRow).not.toBeVisible({ timeout: 10000 });
});
