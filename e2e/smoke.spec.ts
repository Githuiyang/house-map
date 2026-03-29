import { test, expect } from '@playwright/test';

test('home page renders and list is visible on desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '公司附近租房地图' })).toBeVisible();
  await expect(page.getByText('小区列表')).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
});

test('click position stays consistent across responsive breakpoints', async ({ page }) => {
  const clickAndRead = async () => {
    const map = page.getByTestId('map-root');
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    const b = box!;
    await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
    const v = await map.getAttribute('data-last-click');
    expect(v).toBeTruthy();
    const m = /(\d+),(\d+)\/(\d+)x(\d+)/.exec(v!);
    expect(m).not.toBeNull();
    const x = Number(m![1]);
    const y = Number(m![2]);
    const w = Number(m![3]);
    const h = Number(m![4]);
    expect(Math.abs(x - Math.round(w / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(y - Math.round(h / 2))).toBeLessThanOrEqual(2);
  };

  await page.goto('/');
  const cases = [
    { width: 1440, height: 900, sidebarVisible: true },
    { width: 1280, height: 800, sidebarVisible: true },
    { width: 1024, height: 768, sidebarVisible: true },
    { width: 769, height: 800, sidebarVisible: true },
    { width: 768, height: 800, sidebarVisible: false },
    { width: 390, height: 844, sidebarVisible: false },
  ];
  for (const c of cases) {
    await page.setViewportSize({ width: c.width, height: c.height });
    if (c.sidebarVisible) {
      await expect(page.getByLabel('筛选')).toBeHidden();
      await expect(page.locator('aside')).toBeVisible();
    } else {
      await expect(page.getByLabel('筛选')).toBeVisible();
      await expect(page.locator('aside')).toBeHidden();
    }
    await clickAndRead();
  }
});
