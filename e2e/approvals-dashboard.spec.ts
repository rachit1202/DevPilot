import { test, expect } from '@playwright/test';

test.describe('DevPilot Milestone 1.7: Approval Center & Real Dashboard E2E Suite', () => {
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  test('1. Real Dashboard Metrics & Data Verification', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Verify dashboard elements
    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.getByText('Total Content Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Published Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Scheduled Content', { exact: true })).toBeVisible();
    await expect(page.getByText('Pending Approvals', { exact: true })).toBeVisible();

    // Verify no SAMPLE badges appear on the 4 primary metric cards
    const sampleBadges = page.locator('span:text-is("SAMPLE")');
    await expect(sampleBadges).toHaveCount(0);

    // Verify Quick Action Banner Review Pending link
    await expect(page.getByText(/Review Pending \(\d+\)/)).toBeVisible();

    // Verify Phase 5 notice
    await expect(page.getByText('Social Accounts Phase 5 (Not Connected)')).toBeVisible();

    // Verify Upcoming Scheduled Posts & Recent Activity Trail cards
    await expect(page.getByText('Upcoming Scheduled Posts')).toBeVisible();
    await expect(page.getByText('Recent Activity Trail')).toBeVisible();
  });

  test('2. Approval Center: Tabs, Metrics, Review Modal, Approval & Rejection Flow', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Create a post and submit for review via browser API
    const testTitle = `E2E Review Post ${Date.now()}`;
    await page.evaluate(async (title) => {
      const createRes = await fetch('http://localhost:4000/api/v1/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          caption: 'Testing the human-in-the-loop approval workflow via E2E test #devpilot',
          contentType: 'SINGLE_IMAGE',
          category: 'WEB_DEV_TIPS',
          hashtags: ['#devpilot', '#e2e'],
        }),
      });
      const createData = await createRes.json();
      const postId = createData.data.post.id;

      await fetch(`http://localhost:4000/api/v1/content/${postId}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    }, testTitle);

    // Navigate to /approvals
    await page.goto('/approvals');
    await expect(page).toHaveURL('http://localhost:3000/approvals');
    await expect(page.locator('h1')).toContainText('Approval Center');

    // Verify Top 4 metrics
    await expect(page.getByText('Awaiting Review')).toBeVisible();
    await expect(page.getByText('Total Approved')).toBeVisible();
    await expect(page.getByText('Total Rejected')).toBeVisible();
    await expect(page.getByText('Total Posts')).toBeVisible();

    // Verify our newly submitted post appears in Pending Approvals
    await expect(page.getByText(testTitle)).toBeVisible({ timeout: 10000 });

    // Open Inspect modal on the submitted post
    const postItem = page.locator('div.p-5', { hasText: testTitle }).first();
    await postItem.getByRole('button', { name: 'Inspect' }).click();

    // Verify Inspect Modal opens with title and caption
    await expect(page.getByText(testTitle).first()).toBeVisible();
    await expect(page.getByText('Post Caption')).toBeVisible();

    // Enter approval comment and approve
    await page.getByPlaceholder(/Approved for CodeCulture/i).fill('Approved via Playwright E2E');
    await page.getByRole('button', { name: 'Approve Post' }).click();

    // Verify modal closes
    await expect(page.getByText('Post Caption')).toBeHidden({ timeout: 10000 });

    // Switch to Approval History tab
    await page.getByRole('button', { name: /Approval History/i }).click();

    // Verify our post appears in history with APPROVED badge
    await expect(page.getByText(testTitle)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Approved via Playwright E2E').first()).toBeVisible();
  });
});
