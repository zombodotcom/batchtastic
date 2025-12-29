import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Import/Export Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.IS_TEST = true);
  });

  test('should import single device config from JSON', async ({ page }) => {
    // 1. Add and CONNECT a device first so we have someone to import to
    await page.evaluate(() => {
      const mockPort = { 
        name: 'MockPort', 
        open: () => Promise.resolve(),
        writable: { getWriter: () => ({ write: () => Promise.resolve(), releaseLock: () => {} }) }
      };
      window.manager.addDevice(mockPort);
      window.manager.devices[0].status = 'ready';
      window.render();
    });

    // 2. Open config panel for the device
    await page.click('[data-testid="configure-device-btn"]');
    
    // 3. Prepare import file
    const deviceId = await page.evaluate(() => window.manager.devices[0].id);
    const importData = {
      deviceId: deviceId,
      config: { region: 'EU_868', channelName: 'ImportedTest', role: 'CLIENT' }
    };
    const filePath = path.join(process.cwd(), 'temp-import.json');
    fs.writeFileSync(filePath, JSON.stringify(importData));

    // 4. Trigger import
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('text=📥 Import');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    // 5. Verify UI updated (it should load into the form)
    await expect(page.locator('#region')).toHaveValue('EU_868');
    await expect(page.locator('#channelName')).toHaveValue('ImportedTest');
    await expect(page.locator('#nodeRole')).toHaveValue('CLIENT');

    // Cleanup
    fs.unlinkSync(filePath);
  });

  test('should export configuration to JSON', async ({ page }) => {
    // 1. Add a device and CONNECT it
    await page.evaluate(() => {
      const mockPort = { name: 'MockPort', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort);
      window.manager.devices[0].status = 'ready';
      window.render();
    });

    // 2. Open config panel
    await page.click('[data-testid="configure-device-btn"]');
    
    // 3. Change some values
    await page.selectOption('#region', 'JP');
    await page.fill('#channelName', 'ExportTest');
    
    // 4. Trigger export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-config-btn"]');
    const download = await downloadPromise;
    
    // 5. Verify download
    expect(download.suggestedFilename()).toContain('device-config-');
    const downloadPath = path.join(process.cwd(), 'temp-export.json');
    await download.saveAs(downloadPath);
    
    const content = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    expect(content.config.region).toBe('JP');
    expect(content.config.channelName).toBe('ExportTest');

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should save and load presets', async ({ page }) => {
    // 1. Add a device so the button is enabled
    await page.evaluate(() => {
      const mockPort = { name: 'Node1', open: () => Promise.resolve() };
      window.manager.addDevice(mockPort);
      window.manager.devices[0].status = 'ready';
      window.render();
    });

    // 2. Open config panel (Configure All)
    await page.click('[data-testid="configure-all-btn"]');
    
    // 2. Change values
    await page.selectOption('#region', 'ANZ');
    await page.fill('#channelName', 'PresetTest');
    
    // 3. Save as preset
    await page.click('[data-testid="save-preset-btn"]'); // Using ID to be safer
    await page.fill('input[id^="promptInput_"]', 'My Test Preset');
    await page.click('#modalSubmitBtn');
    
    // 4. Verify preset exists in dropdown
    await page.waitForTimeout(500); // Wait for UI update
    const presetOptionExists = await page.evaluate(() => {
      const select = document.getElementById('configPresetSelect');
      return Array.from(select.options).some(option => option.textContent === 'My Test Preset');
    });
    expect(presetOptionExists).toBe(true);
    
    // 5. Reset values and load preset
    await page.selectOption('#region', 'US');
    await page.selectOption('#configPresetSelect', { label: 'My Test Preset' });
    
    // 6. Verify values restored
    await expect(page.locator('#region')).toHaveValue('ANZ');
    await expect(page.locator('#channelName')).toHaveValue('PresetTest');
  });
});

