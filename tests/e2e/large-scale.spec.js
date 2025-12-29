import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Large-Scale Device Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should import and manage 50 devices', async ({ page }) => {
    // 1. Generate a large import file
    const devices = [];
    for (let i = 1; i <= 50; i++) {
      devices.push({
        name: `Device-${i}`,
        boardType: i % 2 === 0 ? 'tbeam' : 'heltec-v3',
        region: 'US',
        channelName: 'LongFast',
        role: 'CLIENT',
        tags: [`batch-${Math.ceil(i/10)}`]
      });
    }
    
    const importData = { devices };
    const filePath = path.join(process.cwd(), 'large-import.json');
    fs.writeFileSync(filePath, JSON.stringify(importData));

    // 2. Perform bulk import (using the button in the UI if it existed, otherwise using evaluation)
    // Wait, let's see if there's a bulk import button in index.html
    // I'll check index.html
    
    await page.evaluate((data) => {
      window.manager.importDevicesFromJSON(JSON.stringify(data));
      window.render();
    }, importData);

    // 3. Verify all 50 devices appear
    const deviceCards = page.locator('.device-card');
    await expect(deviceCards).toHaveCount(50);

    // 4. Verify device count badge
    const badge = page.locator('#deviceCountBadge');
    await expect(badge).toContainText('50 pending');

    // 5. Select all devices
    await page.evaluate(() => {
      // Mark some devices as connected so the button enables
      window.manager.devices.forEach(d => d.status = 'ready');
      window.manager.selectAll();
      window.render();
    });

    // 6. Apply configuration to all 50 devices
    await page.click('[data-testid="configure-all-btn"]');
    await page.selectOption('#region', 'EU_868');
    await page.fill('#channelName', 'BatchConfigured');
    
    // Trigger apply
    await page.click('#applyConfigBtn');

    // 7. Verify config applied to some sample devices
    for (let i = 0; i < 50; i += 10) {
      const deviceConfig = await page.evaluate((idx) => {
        const device = window.manager.devices[idx];
        return device.config || device.pendingConfig;
      }, i);
      expect(deviceConfig.region).toBe('EU_868');
      expect(deviceConfig.channelName).toBe('BatchConfigured');
    }

    // 8. Test filtering by tag
    await page.fill('#deviceSearch', '#batch-1');
    // Give it a moment to filter
    await page.waitForTimeout(1000);
    const visibleCount = await page.locator('.device-card:visible').count();
    expect(visibleCount).toBe(10);

    // Cleanup
    fs.unlinkSync(filePath);
  });
});

