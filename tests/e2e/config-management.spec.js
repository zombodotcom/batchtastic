import { test, expect } from '@playwright/test';

test.describe('Configuration Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.IS_TEST = true);
  });

  test('should manage configuration presets', async ({ page }) => {
    // 1. Add a dummy device so the button is enabled
    await page.evaluate(() => {
      const mockPort = { name: 'Node1', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort);
      window.manager.devices[0].status = 'ready';
      window.render();
    });

    // 2. Open config panel
    await page.click('[data-testid="configure-all-btn"]');
    
    // 2. Change values
    await page.selectOption('#region', 'EU_868');
    await page.fill('#channelName', 'PresetTest');
    
    // 3. Save as preset
    await page.click('[data-testid="save-preset-btn"]');
    await page.fill('input[id^="promptInput_"]', 'Custom Preset');
    await page.click('#modalSubmitBtn');
    
    // 4. Verify in dropdown
    await expect(page.locator('#configPresetSelect')).toContainText('Custom Preset');
    
    // 5. Change values and load preset
    await page.selectOption('#region', 'US');
    await page.selectOption('#configPresetSelect', { label: 'Custom Preset' });
    
    // 6. Verify restored
    await expect(page.locator('#region')).toHaveValue('EU_868');
    await expect(page.locator('#channelName')).toHaveValue('PresetTest');
  });

  test('should manage groups and tags via API', async ({ page }) => {
    // This test uses page.evaluate to test the underlying manager via UI interactions
    
    // 1. Add devices
    await page.evaluate(() => {
      const mockPort1 = { name: 'Node1', open: () => Promise.resolve() };
      const mockPort2 = { name: 'Node2', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort1);
      window.manager.addDevice(mockPort2);
      window.render();
    });

    // 2. Create group and add device
    await page.evaluate(() => {
      const group = window.manager.createGroup('TestGroup');
      const deviceId = window.manager.devices[0].id;
      window.manager.addDeviceToGroup(deviceId, group.id);
      window.render();
    });

    // 3. Add tags
    await page.evaluate(() => {
      const deviceId = window.manager.devices[1].id;
      window.manager.addTag(deviceId, 'urgent');
      window.render();
    });

    // 4. Verify UI reflects tags
    await expect(page.locator('text=#urgent')).toBeVisible();
    
    // 5. Test search by tag
    await page.fill('#deviceSearch', '#urgent');
    // Give it a moment to filter
    await page.waitForTimeout(1000);
    const visibleCount = await page.locator('.device-card:visible').count();
    expect(visibleCount).toBe(1);
    
    // 6. Test search by group (if UI supported it, otherwise verify via evaluate)
    const isInGroup = await page.evaluate(() => {
      const device = window.manager.devices[0];
      return device.groupId !== null;
    });
    expect(isInGroup).toBe(true);
  });
});

