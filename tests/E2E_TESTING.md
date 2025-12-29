# End-to-End (E2E) Testing Guide

Batchtastic Pro uses **Playwright** for end-to-end testing to ensure the UI and batch operations work correctly across different browsers.

## 🚀 Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run all tests (Unit + E2E)
npm run test:all
```

## 📂 Test Structure

E2E tests are located in `tests/e2e/`:

- `large-scale.spec.js`: Tests handling 50+ devices and bulk operations.
- `import-export.spec.js`: Tests JSON/CSV import and configuration export workflows.
- `config-management.spec.js`: Tests the configuration panel, presets, groups, and tags.
- `device-management.spec.js`: Tests adding, removing, and selecting devices.
- `firmware-flashing.spec.js`: Tests firmware selection and UI feedback for flashing.

## 🛠️ Configuration

Configuration is located in `playwright.config.js`. It is set up to:
- Run tests in Chromium, Firefox, and WebKit.
- Automatically start the development server (`npm run dev`) before running tests.
- Capture screenshots and videos on failure.
- Set the base URL to `http://localhost:5173`.

## 📝 Writing New Tests

New tests should follow the `.spec.js` naming convention in the `tests/e2e/` directory.

Example:
```javascript
import { test, expect } from '@playwright/test';

test('my new feature', async ({ page }) => {
  await page.goto('/');
  await page.click('text=My Button');
  await expect(page.locator('#my-element')).toBeVisible();
});
```

## 🧪 Mocking Hardware in E2E

Since Playwright runs in a real browser, we mock hardware APIs (Web Serial, Web Bluetooth) by evaluating script on the page:

```javascript
await page.evaluate(() => {
  const mockPort = { 
    name: 'MockNode', 
    open: () => Promise.resolve() 
  };
  window.manager.addDevice(mockPort);
  window.render();
});
```

## 📊 Coverage

E2E tests currently do not contribute to the Vitest coverage report. To see unit test coverage, run:
```bash
npm run test:coverage
```

