import { test, expect } from '@playwright/test';

test.describe('Device Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should select and deselect devices', async ({ page }) => {
    // 1. Add and CONNECT devices
    await page.evaluate(() => {
      const mockPort1 = { name: 'Node1', open: () => Promise.resolve() };
      const mockPort2 = { name: 'Node2', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort1);
      window.manager.addDevice(mockPort2);
      // Mark them as ready (connected)
      window.manager.devices[0].status = 'ready';
      window.manager.devices[1].status = 'ready';
      window.render();
    });

    // 2. Verify checkboxes exist
    const checkboxes = page.locator('.device-card input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);

    // 3. Click one checkbox
    await checkboxes.first().click();
    
    // 4. Verify selection count badge
    // The button text changes when devices are connected and selected
    await expect(page.locator('#applyProfileBtn')).toContainText('Configure 1 Selected');

    // 5. Select all
    await page.evaluate(() => {
      window.manager.selectAll();
      window.render();
    });
    await expect(page.locator('#applyProfileBtn')).toContainText('Configure 2 Selected');

    // 6. Deselect all
    await page.evaluate(() => {
      window.manager.deselectAll();
      window.render();
    });
    await expect(page.locator('#applyProfileBtn')).toContainText('Configure All');
  });

  test('should remove devices', async ({ page }) => {
    // 1. Add device
    await page.evaluate(() => {
      const mockPort = { name: 'RemoveMe', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort);
      window.render();
    });
    await expect(page.locator('.device-card')).toHaveCount(1);

    // 2. Click remove button
    await page.click('button[title="Remove device"]');
    
    // 3. Verify gone
    await expect(page.locator('.device-card')).toHaveCount(0);
    await expect(page.locator('text=No devices added yet')).toBeVisible();
  });
});

