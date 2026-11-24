import { test, expect } from '@playwright/test';

test.describe('DevPilot Content & Media Real Browser E2E Suite', () => {
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  test('1. Content Library: Create post, list it, view it, and verify in browser DOM', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // 2. Navigate to Content Library
    await page.goto('/content');
    await expect(page).toHaveURL('http://localhost:3000/content');
    await expect(page.locator('h1')).toContainText('Content Library');

    // 3. Open Create Post Modal
    await page.getByRole('button', { name: /Create Post/i }).click();
    await expect(page.getByText('Create New CodeCulture Post')).toBeVisible();

    // 4. Fill form
    const uniqueTitle = `Browser E2E Post ${Date.now()}`;
    await page.getByPlaceholder('e.g. 5 Clean Code Rules for React Developers').fill(uniqueTitle);
    await page.getByPlaceholder('Write the full post caption').fill('This is a verified real browser post created by Playwright for Milestone 1.4.');

    // 5. Submit post inside modal form
    await page.locator('form').getByRole('button', { name: 'Create Post' }).click();

    // 6. Verify post appears in the list
    await expect(page.getByRole('heading', { name: uniqueTitle })).toBeVisible();

    // Take screenshot of Content Library with created post
    await page.screenshot({
      path: 'C:/Users/hp/.gemini/antigravity/brain/ed8e06a2-3284-4cde-a209-b4e998839480/content-library.png',
      fullPage: true,
    });

    // 7. Open view modal
    await page.locator('div').filter({ hasText: uniqueTitle }).getByTitle('View Full Post').first().click();
    await expect(page.getByRole('heading', { level: 2, name: uniqueTitle })).toBeVisible();
    await page.screenshot({
      path: 'C:/Users/hp/.gemini/antigravity/brain/ed8e06a2-3284-4cde-a209-b4e998839480/view-post-modal.png',
    });
  });

  test('2. Media Library: Renders storage metrics and upload interface', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // 2. Navigate to Media Library
    await page.goto('/media');
    await expect(page).toHaveURL('http://localhost:3000/media');
    await expect(page.locator('h1')).toContainText('Media Library');
    await expect(page.getByText('Total Media Assets')).toBeVisible();
    await expect(page.getByText('Storage Protection')).toBeVisible();

    // 3. Open Upload Modal
    await page.getByRole('button', { name: /Upload Media/i }).click();
    await expect(page.getByText('Supported formats: JPEG, PNG, WebP, GIF (Max 10MB)')).toBeVisible();

    // Take screenshot of Media Library
    await page.screenshot({
      path: 'C:/Users/hp/.gemini/antigravity/brain/ed8e06a2-3284-4cde-a209-b4e998839480/media-library.png',
    });
  });

  test('3. Content Library: Duplicate Post and Archive / Restore workflow', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // 2. Navigate to Content Library
    await page.goto('/content');
    await expect(page).toHaveURL('http://localhost:3000/content');

    // 3. Create a unique test post
    const baseTitle = `E2E Duplicate Test ${Date.now()}`;
    await page.getByRole('button', { name: /Create Post/i }).click();
    await page.getByPlaceholder('e.g. 5 Clean Code Rules for React Developers').fill(baseTitle);
    await page.getByPlaceholder('Write the full post caption').fill('Original caption to duplicate and archive in E2E tests.');
    await page.locator('form').getByRole('button', { name: 'Create Post' }).click();

    // Verify created
    await expect(page.getByRole('heading', { name: baseTitle })).toBeVisible();

    // 4. Duplicate Post
    const postItem = page.locator('div.p-4', { hasText: baseTitle }).first();
    await postItem.getByTitle('Duplicate Post').click();

    // Verify Duplicate Modal opens with prefilled content and (Copy) title
    await expect(page.getByText('Duplicate Content Post (New Draft)')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 5 Clean Code Rules for React Developers')).toHaveValue(`${baseTitle} (Copy)`);
    await expect(page.getByPlaceholder('Write the full post caption')).toHaveValue('Original caption to duplicate and archive in E2E tests.');

    // Submit duplicate
    await page.locator('form').getByRole('button', { name: 'Create Post' }).click();
    await expect(page.getByRole('heading', { name: `${baseTitle} (Copy)` })).toBeVisible();

    // 5. Archive Post
    const originalItem = page.locator('div.p-4', { hasText: baseTitle }).filter({ hasNotText: '(Copy)' }).first();
    await originalItem.getByTitle('Archive Post').click();

    // Verify Archive Confirmation Modal
    await expect(page.getByText('Archive Content Post')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Archive' }).click();

    // Verify post receives ARCHIVED badge and restore button
    await expect(page.locator('div.p-4', { hasText: baseTitle }).filter({ hasNotText: '(Copy)' }).getByText('ARCHIVED')).toBeVisible();
    const archivedItem = page.locator('div.p-4', { hasText: baseTitle }).filter({ hasNotText: '(Copy)' }).first();
    await expect(archivedItem.getByTitle('Restore Post to Draft')).toBeVisible();

    // 6. Restore Post
    await archivedItem.getByTitle('Restore Post to Draft').click();
    await expect(page.locator('div.p-4', { hasText: baseTitle }).filter({ hasNotText: '(Copy)' }).getByText('DRAFT')).toBeVisible();
  });
});
