import { test, expect } from '@playwright/test';

test('home page renders with slogan and map area', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  // Current page slogan (app/page.tsx h1.slogan)
  await expect(page.getByRole('heading', { name: '找到你公司附近最合适的房子' })).toBeVisible();
  // Map container exists (NEXT_PUBLIC_DISABLE_MAP=1 in CI shows disabled state)
  const mapRoot = page.getByTestId('map-root');
  await expect(mapRoot).toBeVisible();
});

test('map disabled text shown in test environment', async ({ page }) => {
  // This test relies on NEXT_PUBLIC_DISABLE_MAP=1 set in playwright.config.ts
  await page.goto('/');
  await expect(page.getByText('地图在测试环境已禁用')).toBeVisible();
});

test('drawer opens on hamburger click and shows filter label', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  // Open drawer via hamburger
  await page.getByRole('button', { name: '菜单' }).click();
  // Drawer should now be visible with "筛选 & 列表" heading
  await expect(page.getByRole('heading', { name: '筛选 & 列表' })).toBeVisible();
});

test('responsive layout hides drawer on narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Drawer should be hidden on mobile
  await expect(page.getByRole('heading', { name: '筛选 & 列表' })).toBeHidden();
  // Mobile filter FAB should be visible
  await expect(page.getByRole('button', { name: '筛选' })).toBeVisible();
});
