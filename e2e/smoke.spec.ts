import { test, expect } from '@playwright/test';

test('home page renders and list is visible on desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '公司附近租房地图' })).toBeVisible();
  await expect(page.getByText('小区列表')).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
});
