import { test, expect } from '@playwright/test';

test('family dashboard shows consent-scoped privacy controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('HAVEN Family Dashboard')).toBeVisible();
  await expect(page.getByText('Companion memory')).toBeVisible();
  await expect(page.getByText('Private to elder')).toBeVisible();
  await expect(page.getByText('Fuzzed events only')).toBeVisible();
});
