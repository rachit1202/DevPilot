import { test, expect } from '@playwright/test';

const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'admin@codeculture.dev';
const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || '';

test.describe('DevPilot Real Browser Authentication & Security E2E Suite', () => {

  test('1. Unauthenticated browser navigation to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('DevPilot');
  });

  test('2. Login page renders correctly with DevPilot & CodeCulture branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('DevPilot');
    await expect(page.getByText('Your AI-powered social media command center')).toBeVisible();
    await expect(page.getByText('CodeCulture', { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder('admin@codeculture.dev')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('3 & 4. Valid owner credentials authenticate, redirect to dashboard, and browser receives HttpOnly cookie', async ({ page, context }) => {
    await page.goto('/login');
    
    // Fill credentials without printing password
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Verify redirected to dashboard /
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();

    // Verify browser received access_token cookie
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === 'access_token');
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
    expect(authCookie?.sameSite).toBe('Lax');
    expect(authCookie?.path).toBe('/');
  });

  test('5. JavaScript cannot read the access token (HttpOnly protection verified)', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Execute script in browser context to verify document.cookie does not expose access_token
    const clientCookies = await page.evaluate(() => document.cookie);
    expect(clientCookies).not.toContain('access_token');

    // Also verify localStorage and sessionStorage have zero tokens
    const localToken = await page.evaluate(() => localStorage.getItem('access_token') || localStorage.getItem('token'));
    const sessionToken = await page.evaluate(() => sessionStorage.getItem('access_token') || sessionStorage.getItem('token'));
    expect(localToken).toBeNull();
    expect(sessionToken).toBeNull();
  });

  test('6. Dashboard renders properly after successful login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.getByText(/Total Content Posts/i)).toBeVisible();
    await expect(page.getByText(/Published Posts/i)).toBeVisible();
    await expect(page.getByText(/Scheduled Content/i)).toBeVisible();
    await expect(page.getByText('Pending Approvals', { exact: true })).toBeVisible();
  });

  test('7. Browser refresh preserves the authenticated session', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Perform hard reload in browser
    await page.reload();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
  });

  test('8. Direct navigation to protected routes works when authenticated', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Directly navigate to /content
    await page.goto('/content');
    await expect(page).toHaveURL('http://localhost:3000/content');
    await expect(page.locator('h1')).toHaveText('Content Library');

    // Directly navigate to /settings/brand
    await page.goto('/settings/brand');
    await expect(page).toHaveURL('http://localhost:3000/settings/brand');
    await expect(page.locator('h1')).toHaveText('Brand Settings');
  });

  test('9. Invalid credentials show a safe error message without redirecting', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill('WrongPassword123!');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Invalid email or password.')).toBeVisible();
  });

  test('10. Logout calls actual backend endpoint, clears session, and redirects to /login', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin@codeculture.dev').fill(ownerEmail);
    await page.getByPlaceholder('Enter your password').fill(ownerPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Click user profile to open menu
    await page.locator('header').getByRole('button').filter({ hasText: /Admin|Administrator|OWNER/i }).click();

    // Click logout
    await page.getByRole('button', { name: /Log out/i }).click();

    // Must redirect to /login
    await expect(page).toHaveURL('http://localhost:3000/login');

    // Verify cookie was cleared
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === 'access_token');
    expect(!authCookie || !authCookie.value).toBe(true);
  });

  test('11. Protected pages redirect to /login after logout', async ({ page }) => {
    // Attempt visiting /content without active session
    await page.goto('/content');
    await expect(page).toHaveURL(/\/login/);
  });

  test('12. Backend unavailable state is handled gracefully with an error banner', async ({ page }) => {
    await page.goto('/login');

    // Intercept /api/v1/auth/login to simulate backend network failure
    await page.route('**/api/v1/auth/login', (route) => route.abort('connectionrefused'));

    await page.getByPlaceholder('admin@codeculture.dev').fill('admin@codeculture.dev');
    await page.getByPlaceholder('Enter your password').fill('SomePassword123!');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Verify user is shown a clean error state without crashing
    await expect(page.getByText(/Failed to fetch|Network error|unavailable/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
