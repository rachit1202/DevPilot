import { test, expect, Page } from '@playwright/test';

test.describe('DevPilot Brand & Application Settings E2E Suite', () => {
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  async function loginAsOwner(page: Page) {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
  }

  test('1. Brand Settings: Loads real database values, saves updates, and preserves after reload', async ({ page }) => {
    // 1. Authenticate
    await loginAsOwner(page);

    // 2. Navigate to /settings/brand
    await page.goto('/settings/brand');
    await expect(page).toHaveURL('http://localhost:3000/settings/brand');
    await expect(page.locator('h1')).toContainText('Brand Settings');

    // 3. Verify initial database values are loaded in form
    const brandNameInput = page.getByPlaceholder('e.g. CodeCulture');
    await expect(brandNameInput).toHaveValue('CodeCulture');

    const taglineInput = page.getByPlaceholder('e.g. Code. Create. Build. Repeat.');
    await expect(taglineInput).toHaveValue('Code. Create. Build. Repeat.');

    // 4. Modify fields
    const updatedTagline = `Code. Create. Build. Repeat. Faster with AI. (${Date.now()})`;
    await taglineInput.fill(updatedTagline);

    const industryInput = page.getByPlaceholder('e.g. Developer Education & Tech Media');
    await industryInput.fill('AI Developer Education');

    // 5. Save changes
    const saveButton = page.getByRole('button', { name: /Save Settings/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 6. Verify success banner
    await expect(page.getByText('Brand settings saved successfully and synchronized in database.')).toBeVisible();

    // 7. Refresh page and verify persistence across reload
    await page.reload();
    await expect(page.getByPlaceholder('e.g. Code. Create. Build. Repeat.')).toHaveValue(updatedTagline);
    await expect(page.getByPlaceholder('e.g. Developer Education & Tech Media')).toHaveValue('AI Developer Education');

    // Restore original tagline
    await page.getByPlaceholder('e.g. Code. Create. Build. Repeat.').fill('Code. Create. Build. Repeat.');
    await page.getByPlaceholder('e.g. Developer Education & Tech Media').fill('Developer Education & Tech Media');
    await page.getByRole('button', { name: /Save Settings/i }).click();
    await expect(page.getByText('Brand settings saved successfully and synchronized in database.')).toBeVisible();
  });

  test('2. Brand Settings: Validation prevents saving invalid inputs', async ({ page }) => {
    // 1. Authenticate
    await loginAsOwner(page);

    // 2. Navigate to /settings/brand
    await page.goto('/settings/brand');
    await expect(page).toHaveURL('http://localhost:3000/settings/brand');
    await expect(page.locator('h1')).toContainText('Brand Settings');

    // 3. Clear brand name to trigger validation
    const brandNameInput = page.getByPlaceholder('e.g. CodeCulture');
    await brandNameInput.fill('');

    const saveButton = page.getByRole('button', { name: /Save Settings/i });
    await saveButton.click();

    // Verify validation error
    await expect(page.getByText('Brand name is required.')).toBeVisible();
  });

  test('3. Application Settings: Loads real saved values, updates timezone, and persists after reload', async ({ page }) => {
    // 1. Authenticate
    await loginAsOwner(page);

    // 2. Navigate to /settings/app
    await page.goto('/settings/app');
    await expect(page).toHaveURL('http://localhost:3000/settings/app');
    await expect(page.locator('h1')).toContainText('Application Settings');

    // 3. Verify initial timezone is Asia/Kolkata
    await expect(page.getByText('Current active timezone:')).toBeVisible();

    // 4. Switch time format to 24-hour
    const button24h = page.getByRole('button', { name: '24-hour (10:00)' });
    await button24h.click();

    // 5. Save settings
    const saveButton = page.getByRole('button', { name: /Save Settings/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 6. Verify success banner
    await expect(page.getByText('Application settings saved successfully.')).toBeVisible();

    // 7. Refresh page and verify persistence
    await page.reload();
    await expect(page.getByRole('button', { name: '24-hour (10:00)' })).toHaveClass(/bg-devpilot-purple/);

    // Restore to 12-hour
    await page.getByRole('button', { name: '12-hour (10:00 AM)' }).click();
    await page.getByRole('button', { name: /Save Settings/i }).click();
    await expect(page.getByText('Application settings saved successfully.')).toBeVisible();
  });
});

