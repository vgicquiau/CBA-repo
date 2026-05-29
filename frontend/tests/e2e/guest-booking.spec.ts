/**
 * Scenario 1 — Guest flow:
 *   login → browse rooms → create booking → "Mes séjours" → cancel
 *
 * Uses storageState from auth.setup.ts (already authenticated as guest).
 */
import { test, expect } from '@playwright/test';

const BOOKING_START = '2027-07-10';
const BOOKING_END   = '2027-07-14';
const GUEST_NAME    = 'Test E2E Séjour';

test('guest: browse rooms → create booking → my trips → cancel', async ({ page }) => {
  // ── 1. Navigate to rooms list ───────────────────────────────────────────────
  await page.goto('/rooms');
  // Subtitle text confirms rooms data has loaded (replaces loading spinner)
  await expect(page.getByText(/chambres, du grenier/)).toBeVisible({ timeout: 15000 });

  // ── 2. Open first room ───────────────────────────────────────────────────────
  // Room names use <span class="serif"> inside clickable cards
  // (the page title uses a <div class="serif">, not a span)
  await page.locator('span.serif').first().click();
  await page.waitForURL(/\/rooms\/.+/);

  // ── 3. Open booking form ─────────────────────────────────────────────────────
  await page.getByRole('button', { name: /Réserver/ }).click();

  // ── 4. Fill form ─────────────────────────────────────────────────────────────
  await page.locator('input[placeholder="Prénom Nom"]').fill(GUEST_NAME);
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(BOOKING_START);
  await dateInputs.nth(1).fill(BOOKING_END);

  // ── 5. Submit ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Confirmer la réservation' }).click();

  // ── 6. Confirm success screen ─────────────────────────────────────────────────
  await expect(page.getByText('Réservation envoyée !')).toBeVisible({ timeout: 15000 });

  // ── 7. Navigate to "Mes séjours" via success screen button ────────────────────
  // Use the .confirmation container to avoid ambiguity with the sidebar button
  await page.locator('.confirmation').getByRole('button', { name: 'Mes séjours' }).click();
  await page.waitForURL('**/my-trips');

  // Booking must appear in the upcoming section
  await expect(page.getByText(GUEST_NAME)).toBeVisible({ timeout: 15000 });

  // ── 8. Cancel the booking ─────────────────────────────────────────────────────
  const bookingRow = page.locator('.row-tap').filter({ hasText: GUEST_NAME });
  await bookingRow.getByRole('button', { name: 'Annuler' }).click();

  // ConfirmDialog: click "Annuler le séjour" to confirm cancellation
  await expect(page.getByText('Annuler ce séjour ?')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler le séjour' }).click();

  // ── 9. Verify booking is gone ─────────────────────────────────────────────────
  await expect(page.getByText(GUEST_NAME)).not.toBeVisible({ timeout: 10000 });
});
