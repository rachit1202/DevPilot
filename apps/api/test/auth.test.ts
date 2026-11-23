import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole } from '@devpilot/shared';
import { roleGuard } from '../src/middleware/role.guard';
import { FastifyReply, FastifyRequest } from 'fastify';

async function runTests() {
  console.log('\n========================================');
  console.log('  DevPilot Milestone 1.2 & 1.3.2 Test Suite');
  console.log('========================================\n');

  const server = buildServer();
  await server.ready();

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${error.message}`);
      failed++;
    }
  }

  // Retrieve seed owner credentials from environment
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';
  const frontendOrigin = 'http://localhost:3000';

  // Helper variables for multi-step tests
  let authCookie = '';
  let authToken = '';

  // 1. Test Server Readiness
  await test('1. API server starts and initializes successfully', async () => {
    assert.ok(server, 'Server instance should exist');
  });

  // 2. Health Endpoint
  await test('2. Health endpoint responds with 200 OK and valid payload', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.service, 'devpilot-api');
    assert.ok(body.data.timestamp);
    assert.ok(typeof body.data.uptime === 'number');
  });

  // 3. Valid Owner Login with legitimate Origin
  await test('3. Valid Owner login succeeds and sets HttpOnly cookie', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: {
        origin: frontendOrigin,
      },
      payload: {
        email: ownerEmail,
        password: ownerPassword,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.user.email, ownerEmail);
    assert.equal(body.data.user.role, UserRole.OWNER);
    assert.equal(body.data.user.passwordHash, undefined, 'passwordHash must never be exposed');
    assert.ok(body.data.token, 'JWT token should be returned');
    authToken = body.data.token;

    // Verify Set-Cookie header
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'set-cookie header should be present');
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    assert.match(cookieHeader, /access_token=/, 'Cookie name should be access_token');
    assert.match(cookieHeader, /HttpOnly/i, 'Cookie must be HttpOnly');
    assert.match(cookieHeader, /SameSite=Lax/i, 'Cookie must have SameSite=Lax');
    authCookie = cookieHeader.split(';')[0];
  });

  // 4. Invalid Password
  await test('4. Invalid password is rejected safely with 401', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: {
        email: ownerEmail,
        password: 'CompletelyWrongPassword123!',
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
    assert.equal(body.message, 'Invalid email or password.');
  });

  // 5. Unknown Email
  await test('5. Unknown email is rejected safely with generic 401 message', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: {
        email: 'nonexistent-user@example.com',
        password: 'SomePassword123!',
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
    assert.equal(body.message, 'Invalid email or password.', 'Must not disclose email existence');
  });

  // 6. Missing Credentials
  await test('6. Missing credentials are rejected with 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Validation failed');
    assert.ok(Array.isArray(body.issues));
  });

  // 7. Authenticated /auth/me
  await test('7. Authenticated /auth/me returns current user profile', async () => {
    // Test with Cookie
    const resCookie = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: authCookie,
      },
    });

    assert.equal(resCookie.statusCode, 200);
    const bodyCookie = JSON.parse(resCookie.body);
    assert.equal(bodyCookie.success, true);
    assert.equal(bodyCookie.data.user.email, ownerEmail);
    assert.equal(bodyCookie.data.user.role, UserRole.OWNER);
    assert.equal(bodyCookie.data.user.passwordHash, undefined);

    // Test with Bearer Header fallback
    const resBearer = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    assert.equal(resBearer.statusCode, 200);
  });

  // 8. Unauthenticated /auth/me
  await test('8. Unauthenticated /auth/me returns 401 Unauthorized', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
  });

  // 9. CSRF Hardening: Reject Unauthorized Origin on Mutating Cookie Request
  await test('9. CSRF Hardening: Malicious origin with cookie is blocked with 403 Forbidden', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: authCookie,
        origin: 'http://malicious-attacker.com',
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Forbidden');
    assert.match(body.message, /CSRF protection/i);
  });

  // 10. CSRF Hardening: Reject Missing Origin on Mutating Cookie Request
  await test('10. CSRF Hardening: Missing Origin and Referer on cookie request is blocked with 403', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: authCookie,
        // No origin, no referer
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Forbidden');
    assert.match(body.message, /CSRF protection/i);
  });

  // 11. CSRF Exemption for Programmatic Bearer Tokens
  await test('11. CSRF Exemption: Programmatic Bearer token request bypasses origin check safely', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${authToken}`,
        origin: 'http://external-api-tool.local',
      },
    });

    assert.equal(res.statusCode, 200);
  });

  // 12. Logout Clears Cookie with Legitimate Origin
  await test('12. Legitimate Logout clears authentication cookie and returns 200 OK', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.message, 'Logged out successfully');

    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'set-cookie header should be present on logout');
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    assert.match(cookieHeader, /access_token=;/, 'access_token should be cleared/expired');
  });

  // 13. Role-Based Guards
  await test('13. Role-based guards allow authorized role and reject unauthorized role', async () => {
    let forbiddenCalled = false;
    let forbiddenPayload: Record<string, unknown> = {};

    const mockReplyForbidden = {
      status: (code: number) => {
        assert.equal(code, 403);
        return {
          send: (payload: Record<string, unknown>) => {
            forbiddenCalled = true;
            forbiddenPayload = payload;
          },
        };
      },
    } as unknown as FastifyReply;

    const mockRequestOwner = {
      user: {
        id: 'user-1',
        email: 'owner@codeculture.dev',
        name: 'Owner User',
        role: UserRole.OWNER,
      },
    } as unknown as FastifyRequest;

    const guardAdminOnly = roleGuard(UserRole.ADMIN);
    await guardAdminOnly(mockRequestOwner, mockReplyForbidden);
    assert.equal(forbiddenCalled, true, 'Should block OWNER from ADMIN-only route');
    assert.equal(forbiddenPayload.error, 'Forbidden');

    let allowedPassed = true;
    const mockReplyAllowed = {
      status: () => {
        allowedPassed = false;
        return { send: () => {} };
      },
    } as unknown as FastifyReply;

    const guardOwnerOrAdmin = roleGuard(UserRole.OWNER, UserRole.ADMIN);
    await guardOwnerOrAdmin(mockRequestOwner, mockReplyAllowed);
    assert.equal(allowedPassed, true, 'Should allow OWNER through OWNER guard');
  });

  // 14. Activity Logging in Database
  await test('14. Activity logs are recorded in database for login, logout, and failed attempts', async () => {
    const recentLogs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const actions = recentLogs.map((l) => l.action);
    assert.ok(actions.includes('USER_LOGIN'), 'Should contain USER_LOGIN log');
    assert.ok(actions.includes('USER_LOGOUT'), 'Should contain USER_LOGOUT log');
    assert.ok(actions.includes('LOGIN_FAILED'), 'Should contain LOGIN_FAILED log');

    for (const log of recentLogs) {
      const metaStr = JSON.stringify(log.metadata || {});
      assert.doesNotMatch(metaStr, /"password":\s*"(?!\[REDACTED\])[^"]+"/, 'No plaintext password in metadata');
    }
  });

  // 15. Login Rate Limiter
  await test('15. Login rate limiting blocks abusive attempts with 429 Too Many Requests', async () => {
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: frontendOrigin },
        payload: {
          email: 'abusive-attempt@example.com',
          password: 'wrongpassword',
        },
      });
      if (res.statusCode === 429) {
        rateLimited = true;
        const body = JSON.parse(res.body);
        assert.equal(body.error, 'Too Many Requests');
        break;
      }
    }
    assert.ok(rateLimited, 'Expected to trigger 429 Too Many Requests within rate window');
  });

  await server.close();
  await prisma.$disconnect();

  console.log('\n----------------------------------------');
  console.log(`  Tests completed: ${passed + failed} total`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
