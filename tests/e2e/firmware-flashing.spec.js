import { test, expect } from '@playwright/test';

test.describe('Firmware Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept firmware API requests
    await page.route('https://api.meshtastic.org/github/firmware/list', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          releases: {
            stable: [
              { id: 'v2.7.17', title: 'Stable v2.7.17', zip_url: 'https://example.com/fw.zip' }
            ],
            alpha: []
          }
        })
      });
    });

    await page.goto('/');
  });

  test('should load and select firmware version', async ({ page }) => {
    // 1. Wait for firmware select to populate
    const select = page.locator('#firmwareType');
    
    // Ensure the element is visible before interacting
    await select.scrollIntoViewIfNeeded();
    await expect(select).toBeVisible();
    await expect(select).toContainText('Stable v2.7.17');

    // 2. Select a version
    await select.selectOption({ label: 'Stable v2.7.17' });
    
    // 3. Verify manager state via evaluate
    const selectedRelease = await page.evaluate(() => window.manager.selectedRelease?.id);
    expect(selectedRelease).toBe('v2.7.17');
  });

  test('should toggle custom file upload', async ({ page }) => {
    const select = page.locator('#firmwareType');
    const customFileInput = page.locator('#customFile');
    
    await select.scrollIntoViewIfNeeded();
    await expect(select).toBeVisible();
    
    // 1. Select custom
    await select.selectOption('custom');
    
    // 2. Verify input visible
    await expect(customFileInput).toBeVisible();
    
    // 3. Select stable again
    await select.selectOption('v2.7.17');
    
    // 4. Verify input hidden
    await expect(customFileInput).not.toBeVisible();
  });
});

