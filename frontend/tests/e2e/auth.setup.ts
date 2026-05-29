/**
 * Global auth setup — runs once before the guest and admin test projects.
 *
 * Requires the following env vars (add to .env.e2e or CI secrets):
 *   E2E_BASE_URL        — deployed dev app URL (default: http://localhost:5173)
 *   E2E_GUEST_EMAIL     — Entra External ID guest test account
 *   E2E_GUEST_PASSWORD  — password for guest account
 *   E2E_ADMIN_EMAIL     — Entra External ID admin test account
 *   E2E_ADMIN_PASSWORD  — password for admin account
 *
 * Both test accounts must have:
 *   - No MFA enforced
 *   - Password auth enabled
 *   - Accepted any Terms of Service on first login
 */
import { test as setup, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const GUEST_AUTH = path.join(__dirname, '.auth/guest.json');
const ADMIN_AUTH = path.join(__dirname, '.auth/admin.json');

async function loginMsal(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');

  // Wait for the LoginScreen — MSAL initialises before showing it
  await expect(page.getByRole('button', { name: 'Connexion' })).toBeVisible({ timeout: 25000 });
  await page.getByRole('button', { name: 'Connexion' }).click();

  // MSAL loginRedirect → Microsoft login page
  await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30000 });

  // Email step
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="submit"]').click();

  // Password step
  await page.locator('input[type="password"], input[name="passwd"]').fill(password);
  await page.locator('input[type="submit"]').click();

  // "Stay signed in?" — dismiss if shown
  try {
    const noBtn = page.getByRole('button', { name: /^(No|Non)$/ });
    await noBtn.waitFor({ timeout: 6000 });
    await noBtn.click();
  } catch {
    // prompt absent, continue
  }

  // Wait for MSAL redirect back and app to fully initialise
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 30000 });
}

setup('authenticate as guest', async ({ page }) => {
  fs.mkdirSync(path.dirname(GUEST_AUTH), { recursive: true });
  await loginMsal(page, process.env.E2E_GUEST_EMAIL!, process.env.E2E_GUEST_PASSWORD!);
  await page.context().storageState({ path: GUEST_AUTH });
});

setup('authenticate as admin', async ({ page }) => {
  fs.mkdirSync(path.dirname(ADMIN_AUTH), { recursive: true });
  await loginMsal(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
  await page.context().storageState({ path: ADMIN_AUTH });
});
