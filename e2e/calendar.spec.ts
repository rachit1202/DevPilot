import { test, expect } from '@playwright/test';

test.describe('DevPilot Content Calendar & Scheduling E2E Suite', () => {
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  test('1. Calendar View Modes: Navigation, timezone, and view switching', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // 2. Navigate to /calendar
    await page.goto('/calendar');
    await expect(page).toHaveURL('http://localhost:3000/calendar');
    await expect(page.locator('h1')).toContainText('Content Calendar');

    // 3. Verify Timezone indicator
    await expect(page.getByText('Asia/Kolkata (UTC+05:30)')).toBeVisible();

    // 4. Verify and switch view modes
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveClass(/bg-devpilot-purple/);

    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveClass(/bg-devpilot-purple/);

    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveClass(/bg-devpilot-purple/);

    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveClass(/bg-devpilot-purple/);
  });

  test('2. Content Scheduling Flow: Schedule, reschedule, cancel, and screenshot verification', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // 2. Create an approved post via authenticated fetch in browser context
    const testTitle = `Scheduled Post E2E ${Date.now()}`;
    await page.evaluate(async (title) => {
      const res = await fetch('http://localhost:4000/api/v1/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          caption: 'E2E testing schedule workflow for CodeCulture',
          contentType: 'SINGLE_IMAGE',
          category: 'WEB_DEV_TIPS',
          hashtags: ['#codeculture', '#testing'],
        }),
      });
      const data = await res.json();
      const postId = data.data?.post?.id || data.post?.id;
      await fetch(`http://localhost:4000/api/v1/content/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment: 'Approved for calendar E2E schedule test' }),
      });
    }, testTitle);

    // 3. Navigate to /calendar
    await page.goto('/calendar');
    await expect(page.locator('h1')).toContainText('Content Calendar');

    // 4. Click "Schedule Post"
    await page.getByRole('button', { name: 'Schedule Post' }).click();
    await expect(page.getByText('Schedule Content Post')).toBeVisible();

    // 5. Select the post from dropdown
    const select = page.locator('form select');
    await select.waitFor({ state: 'visible' });
    await expect(select.locator('option', { hasText: testTitle })).toBeAttached({ timeout: 5000 });
    const option = await select.locator('option', { hasText: testTitle }).getAttribute('value');
    if (option) {
      await select.selectOption(option);
    }

    // 6. Set future date/time (tomorrow 14:00)
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const y = future.getFullYear();
    const m = String(future.getMonth() + 1).padStart(2, '0');
    const d = String(future.getDate()).padStart(2, '0');
    const dtString = `${y}-${m}-${d}T14:00`;
    await page.locator('input[type="datetime-local"]').fill(dtString);

    // 7. Confirm schedule
    await page.getByRole('button', { name: 'Confirm Schedule' }).click();
    await expect(page.getByText('Content post scheduled successfully!')).toBeVisible();

    // 8. Switch to List view to locate post easily
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByRole('heading', { name: testTitle })).toBeVisible();

    // 9. Capture screenshot of calendar with scheduled post
    await page.screenshot({
      path: 'C:/Users/hp/.gemini/antigravity/brain/ed8e06a2-3284-4cde-a209-b4e998839480/calendar-view.png',
      fullPage: true,
    });

    // 10. Reschedule
    const postItem = page.locator('div.p-4').filter({ hasText: testTitle }).first();
    await postItem.getByRole('button', { name: 'Reschedule' }).click();
    await expect(page.getByText('Reschedule Post')).toBeVisible();

    const future2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const dtString2 = `${future2.getFullYear()}-${String(future2.getMonth() + 1).padStart(2, '0')}-${String(future2.getDate()).padStart(2, '0')}T16:30`;
    await page.locator('input[type="datetime-local"]').fill(dtString2);
    await page.getByRole('button', { name: 'Update Schedule' }).click();
    await expect(page.getByText(/Post rescheduled to/)).toBeVisible();

    // 11. Cancel Schedule
    await postItem.getByTitle('Cancel Schedule').click();
    await expect(page.getByText('Cancel Publishing Schedule')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Cancel' }).click();
    await expect(page.getByText('Schedule cancelled. Post returned to APPROVED status.')).toBeVisible();
  });
});
