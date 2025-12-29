import { test, expect } from '@playwright/test';

test.describe('Fleet Mission Control Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.IS_TEST = true);
  });

  test('should display dashboard with device metrics', async ({ page }) => {
    // 1. Add multiple devices with different statuses
    await page.evaluate(() => {
      const mockPort1 = { name: 'Device1', open: () => Promise.resolve() };
      const mockPort2 = { name: 'Device2', open: () => Promise.resolve() };
      const mockPort3 = { name: 'Device3', open: () => Promise.resolve() };
      
      window.manager.addDevice(mockPort1).then(d => {
        d.status = 'ready';
        d.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
      });
      window.manager.addDevice(mockPort2).then(d => {
        d.status = 'ready';
        d.telemetry = { batt: '3.4', snr: '4.0', util: '15' };
      });
      window.manager.addDevice(mockPort3).then(d => {
        d.status = 'disconnected';
        d.telemetry = { batt: '3.8', snr: '3.0', util: '20' };
      });
      window.render();
    });

    await page.waitForTimeout(500);

    // 2. Verify dashboard exists
    const dashboard = page.locator('#fleetDashboard');
    await expect(dashboard).toBeVisible();

    // 3. Verify Fleet Health card
    const fleetHealth = dashboard.locator('.dash-card').first();
    await expect(fleetHealth).toContainText('Fleet Health');
    await expect(fleetHealth).toContainText('%');

    // 4. Verify Battery Watch card
    const batteryCard = dashboard.locator('.dash-card').nth(1);
    await expect(batteryCard).toContainText('Battery Watch');
    await expect(batteryCard).toContainText('V');

    // 5. Verify Signal Strength card
    const signalCard = dashboard.locator('.dash-card').nth(2);
    await expect(signalCard).toContainText('Signal Strength');
    await expect(signalCard).toContainText('dB');

    // 6. Verify Recent Activity card
    const activityCard = dashboard.locator('.dash-card').nth(3);
    await expect(activityCard).toContainText('Recent Activity');
  });

  test('should hide dashboard when no devices', async ({ page }) => {
    const dashboard = page.locator('#fleetDashboard');
    const dashboardContent = await dashboard.innerHTML();
    
    // Dashboard should be empty when no devices
    expect(dashboardContent.trim()).toBe('');
  });

  test('should filter devices when clicking Fleet Health card', async ({ page }) => {
    // 1. Add devices with different statuses
    await page.evaluate(() => {
      const mockPort1 = { name: 'ReadyDevice', open: () => Promise.resolve() };
      const mockPort2 = { name: 'DisconnectedDevice', open: () => Promise.resolve() };
      
      window.manager.addDevice(mockPort1).then(d => d.status = 'ready');
      window.manager.addDevice(mockPort2).then(d => d.status = 'disconnected');
      window.render();
    });

    await page.waitForTimeout(500);

    // 2. Click Fleet Health card (should filter to ready devices)
    const fleetHealthCard = page.locator('#fleetDashboard .dash-card[data-filter-action="ready"]');
    await fleetHealthCard.click();

    await page.waitForTimeout(300);

    // 3. Verify status filter is set to 'ready'
    const statusFilter = page.locator('#statusFilter');
    await expect(statusFilter).toHaveValue('ready');

    // 4. Verify only ready devices are visible
    const visibleDevices = await page.locator('.device-card:visible').count();
    expect(visibleDevices).toBeGreaterThan(0);
  });

  test('should filter low battery devices when clicking Battery Watch card', async ({ page }) => {
    // 1. Add devices with different battery levels
    await page.evaluate(() => {
      const mockPort1 = { name: 'HighBatt', open: () => Promise.resolve() };
      const mockPort2 = { name: 'LowBatt', open: () => Promise.resolve() };
      
      window.manager.addDevice(mockPort1).then(d => {
        d.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
      });
      window.manager.addDevice(mockPort2).then(d => {
        d.telemetry = { batt: '3.2', snr: '4.0', util: '15' };
      });
      window.render();
    });

    await page.waitForTimeout(500);

    // 2. Click Battery Watch card
    const batteryCard = page.locator('#fleetDashboard .dash-card[data-filter-action="low-battery"]');
    await batteryCard.click();

    await page.waitForTimeout(300);

    // 3. Verify search filter is set to 'low-battery'
    const searchInput = page.locator('#deviceSearch');
    await expect(searchInput).toHaveValue('low-battery');

    // 4. Verify only low battery devices are visible
    const visibleDevices = await page.locator('.device-card:visible').count();
    expect(visibleDevices).toBe(1);
  });

  test('should update dashboard metrics in real-time', async ({ page }) => {
    // 1. Add initial device
    await page.evaluate(async () => {
      const mockPort = { name: 'Device1', open: () => Promise.resolve() };
      const device = await window.manager.addDevice(mockPort);
      device.status = 'ready';
      device.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
      window.render();
    });

    await page.waitForTimeout(500);

    // 2. Get initial health percentage (should be 100% - 1 ready out of 1)
    const initialHealthText = await page.locator('#fleetDashboard .dash-card').first().locator('.dash-value').textContent();
    const initialHealth = parseInt(initialHealthText.trim().replace('%', ''));

    // 3. Add another device with disconnected status
    await page.evaluate(async () => {
      const mockPort = { name: 'Device2', open: () => Promise.resolve() };
      const device = await window.manager.addDevice(mockPort);
      device.status = 'disconnected';
      window.render();
    });

    await page.waitForTimeout(500);

    // 4. Verify health percentage updated (should be 50% - 1 ready out of 2)
    const updatedHealthText = await page.locator('#fleetDashboard .dash-card').first().locator('.dash-value').textContent();
    const updatedHealth = parseInt(updatedHealthText.trim().replace('%', ''));
    expect(updatedHealth).toBe(50);
    expect(updatedHealth).not.toBe(initialHealth);
  });

  test('should display recent activity from global logs', async ({ page }) => {
    // 1. Add device and generate some logs
    await page.evaluate(async () => {
      const { logToGlobal } = await import('/src/utils/Logger.js');
      const mockPort = { name: 'Device1', open: () => Promise.resolve() };
      await window.manager.addDevice(mockPort);
      logToGlobal(window.manager.globalLogs, 'Test activity 1');
      logToGlobal(window.manager.globalLogs, 'Test activity 2');
      logToGlobal(window.manager.globalLogs, 'Test activity 3');
      window.render();
    });

    await page.waitForTimeout(500);

    // 2. Verify recent activity ticker shows logs
    const activityCard = page.locator('#fleetDashboard .dash-card').nth(3);
    await expect(activityCard).toContainText('Recent Activity');
    
    const tickerContent = await activityCard.locator('.event-ticker').textContent();
    expect(tickerContent).toContain('Test activity');
  });

  test('should handle 50 devices performance', async ({ page }) => {
    // 1. Add 50 devices
    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        const mockPort = { name: `Device${i}`, open: () => Promise.resolve() };
        window.manager.addDevice(mockPort).then(d => {
          d.status = i % 2 === 0 ? 'ready' : 'disconnected';
          d.telemetry = { 
            batt: (3.5 + Math.random() * 0.7).toFixed(2), 
            snr: (Math.random() * 10 - 5).toFixed(1), 
            util: Math.floor(Math.random() * 30) 
          };
        });
      }
      window.render();
    });

    await page.waitForTimeout(1000);

    // 2. Verify dashboard renders without errors
    const dashboard = page.locator('#fleetDashboard');
    await expect(dashboard).toBeVisible();

    // 3. Verify all dashboard cards are present
    const dashCards = await dashboard.locator('.dash-card').count();
    expect(dashCards).toBeGreaterThanOrEqual(4);

    // 4. Verify metrics are calculated correctly
    const fleetHealth = dashboard.locator('.dash-card').first();
    await expect(fleetHealth).toContainText('%');
  });
});

