/**
 * Scenario 2 — Admin flow:
 *   login → dashboard (read KPI) → create room → verify KPI +1 → delete room → verify KPI restored
 *
 * Uses storageState from auth.setup.ts (already authenticated as admin).
 */
import { test, expect, type Page } from '@playwright/test';

// Unique suffix per test run so parallel CI shards never collide
const RUN_SUFFIX  = Date.now().toString().slice(-8);
const E2E_ROOM_ID = `e2e-${RUN_SUFFIX}`;
const E2E_ROOM_NAME = `Chambre E2E ${RUN_SUFFIX}`;

async function getRoomKpiCount(page: Page): Promise<number> {
  // Kpi component: <div class="serif">{count}</div> + <div class="mono">{label}</div>
  // Locate the KPI card via its label text (textTransform:uppercase in CSS, DOM text stays lowercase)
  const kpiLabel = page.getByText('chambres au catalogue');
  await expect(kpiLabel).toBeVisible({ timeout: 15000 });
  const kpiCard = kpiLabel.locator('..');
  const valueStr = await kpiCard.locator('.serif').textContent();
  return parseInt(valueStr ?? '0', 10);
}

test('admin: dashboard → create room → KPI +1 → delete room → KPI restored', async ({ page }) => {
  // ── 1. Read initial room count from dashboard ──────────────────────────────
  await page.goto('/admin');
  await expect(page.getByText('Tableau de bord')).toBeVisible({ timeout: 15000 });
  const initialCount = await getRoomKpiCount(page);

  // ── 2. Navigate to admin rooms list ───────────────────────────────────────
  await page.goto('/admin/rooms');
  // Topbar shows "Chambres" — wait for the list to render
  await expect(page.getByText('chambres au catalogue')).toBeVisible({ timeout: 15000 });

  // ── 3. Open "create room" form ─────────────────────────────────────────────
  await page.getByRole('button', { name: '+ Ajouter une chambre' }).click();
  await expect(page.getByText('Nouvelle chambre')).toBeVisible({ timeout: 5000 });

  // ── 4. Fill required fields ────────────────────────────────────────────────
  await page.locator('input[placeholder="glycine, pigeonnier…"]').fill(E2E_ROOM_ID);
  await page.locator('input[placeholder="La Glycine"]').fill(E2E_ROOM_NAME);
  await page.locator('input[placeholder="Aile gauche…"]').fill('Test');
  // beds (default "1 lit double") and capacity (default 2) are already valid

  // ── 5. Submit ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Créer la chambre' }).click();

  // Back on list view after creation
  await expect(page.getByText(E2E_ROOM_NAME)).toBeVisible({ timeout: 10000 });

  // ── 6. Verify dashboard KPI increased by 1 ────────────────────────────────
  await page.goto('/admin');
  await expect(page.getByText('Tableau de bord')).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText('chambres au catalogue').locator('..').locator('.serif'),
  ).toHaveText((initialCount + 1).toString(), { timeout: 15000 });

  // ── 7. Delete the room ────────────────────────────────────────────────────
  await page.goto('/admin/rooms');
  await page.getByText(E2E_ROOM_NAME).click();
  await expect(page.getByText('Modifier la chambre')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Supprimer la chambre' }).click();
  // ConfirmDialog
  await expect(page.getByText(`Supprimer « ${E2E_ROOM_NAME} » ?`)).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer' }).click();

  // Back on list — room must be gone
  await expect(page.getByText(E2E_ROOM_NAME)).not.toBeVisible({ timeout: 10000 });

  // ── 8. Verify dashboard KPI restored ─────────────────────────────────────
  await page.goto('/admin');
  await expect(page.getByText('Tableau de bord')).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText('chambres au catalogue').locator('..').locator('.serif'),
  ).toHaveText(initialCount.toString(), { timeout: 15000 });
});
