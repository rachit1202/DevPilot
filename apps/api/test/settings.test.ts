import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, PostStatus, ContentType, ContentCategory, ianaLocalToUtc } from '@devpilot/shared';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../src/modules/settings/settings.service';

async function runSettingsTests() {
  console.log('\n======================================================');
  console.log('  DevPilot Milestone 1.6: Settings Backend Test Suite');
  console.log('======================================================\n');

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

  const frontendOrigin = 'http://localhost:3000';
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  // Helper to authenticate
  async function loginAs(email: string, pass: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email, password: pass },
    });
    assert.equal(res.statusCode, 200, `Login for ${email} should succeed`);
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  const ownerCookie = await loginAs(ownerEmail, ownerPassword);
  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });

  // Setup Admin user
  const adminEmail = 'admin2.settings@codeculture.dev';
  const adminPassword = 'SecureAdmin123!';
  let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!adminUser) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Settings Admin',
        passwordHash,
        role: UserRole.ADMIN,
      },
    });
  }
  const adminCookie = await loginAs(adminEmail, adminPassword);

  // Setup Editor user
  const editorEmail = 'editor.settings@codeculture.dev';
  const editorPassword = 'SecureEditor123!';
  let editorUser = await prisma.user.findUnique({ where: { email: editorEmail } });
  if (!editorUser) {
    const passwordHash = await bcrypt.hash(editorPassword, 10);
    editorUser = await prisma.user.create({
      data: {
        email: editorEmail,
        name: 'Settings Editor',
        passwordHash,
        role: UserRole.EDITOR,
      },
    });
  }
  const editorCookie = await loginAs(editorEmail, editorPassword);

  // Setup Analyst user
  const analystEmail = 'analyst.settings@codeculture.dev';
  const analystPassword = 'SecureAnalyst123!';
  let analystUser = await prisma.user.findUnique({ where: { email: analystEmail } });
  if (!analystUser) {
    const passwordHash = await bcrypt.hash(analystPassword, 10);
    analystUser = await prisma.user.create({
      data: {
        email: analystEmail,
        name: 'Settings Analyst',
        passwordHash,
        role: UserRole.ANALYST,
      },
    });
  }
  const analystCookie = await loginAs(analystEmail, analystPassword);

  // Preserve initial brand state to restore after tests
  const initialBrand = await prisma.brandSettings.findFirst();
  assert.ok(initialBrand, 'Initial brand settings must exist in database');

  // Reset settings to defaults at start of test run
  await prisma.applicationSettings.updateMany({
    data: {
      timezone: 'Asia/Kolkata',
      defaultLanguage: 'en',
      timeFormat: '12h',
      dateFormat: 'YYYY-MM-DD',
      firstDayOfWeek: 0,
      defaultView: 'month',
    },
  });
  await prisma.brandSettings.update({
    where: { isSingleton: true },
    data: {
      brandName: 'CodeCulture',
      tagline: 'Code. Create. Build. Repeat.',
      primaryColor: '#8B5CF6',
      secondaryColor: '#06B6D4',
      industry: 'Developer Education & Tech Media',
      primaryLanguage: 'en',
    },
  });

  // =========================================================================
  // 1. Retrieve existing CodeCulture brand settings
  // =========================================================================
  await test('1. Retrieve existing CodeCulture brand settings (200 OK)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.brandName, 'CodeCulture');
    assert.ok(body.data.primaryColor);
    assert.ok(body.data.secondaryColor);
    assert.ok(Array.isArray(body.data.topics));
  });

  // =========================================================================
  // 2. Update brand name and tagline
  // =========================================================================
  await test('2. Update brand name and tagline via PATCH /api/v1/settings/brand (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        brandName: 'CodeCulture AI',
        tagline: 'Code. Create. Build. Repeat. Everyday.',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.brandName, 'CodeCulture AI');
    assert.equal(body.data.tagline, 'Code. Create. Build. Repeat. Everyday.');
  });

  // =========================================================================
  // 3. Update brand colors
  // =========================================================================
  await test('3. Update brand primary and secondary colors (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        primaryColor: '#7C3AED',
        secondaryColor: '#0EA5E9',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.primaryColor, '#7C3AED');
    assert.equal(body.data.secondaryColor, '#0EA5E9');
  });

  // =========================================================================
  // 4. Update brand voice, audience, and industry
  // =========================================================================
  await test('4. Update brand voice, audience, and industry (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        tone: 'Energetic, informative, and humorous',
        audience: 'Senior developers and engineering leaders',
        industry: 'Developer Tools & SaaS',
        description: 'Comprehensive brand for modern developers and vibe coders.',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.tone, 'Energetic, informative, and humorous');
    assert.equal(body.data.audience, 'Senior developers and engineering leaders');
    assert.equal(body.data.industry, 'Developer Tools & SaaS');
    assert.equal(body.data.description, 'Comprehensive brand for modern developers and vibe coders.');
  });

  // =========================================================================
  // 5. Reject invalid URLs and invalid hex colors
  // =========================================================================
  await test('5. Reject invalid URLs and invalid hex colors with 400 Bad Request', async () => {
    // Invalid URL
    const badUrlRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        websiteUrl: 'not-a-valid-url',
      },
    });
    assert.equal(badUrlRes.statusCode, 400);

    // Invalid hex color
    const badColorRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        primaryColor: 'red', // not hex
      },
    });
    assert.equal(badColorRes.statusCode, 400);

    // Short hex color (3 digits instead of 6)
    const shortColorRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        primaryColor: '#FFF',
      },
    });
    assert.equal(shortColorRes.statusCode, 400);
  });

  // =========================================================================
  // 6. Reject unauthenticated modifications
  // =========================================================================
  await test('6. Reject unauthenticated brand modifications with 401 Unauthorized', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      payload: {
        brandName: 'Hacked Brand',
      },
    });
    assert.equal(res.statusCode, 401);
  });

  // =========================================================================
  // 7. Reject unauthorized EDITOR/APPROVER/ANALYST modifications
  // =========================================================================
  await test('7. Reject unauthorized EDITOR and ANALYST modifications with 403 Forbidden', async () => {
    // Editor attempt
    const edRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { brandName: 'Editor Renamed Brand' },
    });
    assert.equal(edRes.statusCode, 403);
    const edBody = JSON.parse(edRes.body);
    assert.match(edBody.message, /Only Owners and Admins have permission/i);

    // Analyst attempt
    const anRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: { brandName: 'Analyst Renamed Brand' },
    });
    assert.equal(anRes.statusCode, 403);
  });

  // =========================================================================
  // 8. Confirm OWNER and ADMIN permissions
  // =========================================================================
  await test('8. Confirm ADMIN role can update brand settings (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: adminCookie, origin: frontendOrigin },
      payload: {
        guidelines: 'Always follow TypeScript strict mode and clean code standards.',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.guidelines, 'Always follow TypeScript strict mode and clean code standards.');
  });

  // =========================================================================
  // 9. Confirm updates persist after a fresh database read
  // =========================================================================
  await test('9. Confirm brand settings updates persist directly in database', async () => {
    const brandInDb = await prisma.brandSettings.findFirst({
      where: { brandName: 'CodeCulture AI' },
    });
    assert.ok(brandInDb);
    assert.equal(brandInDb.primaryColor, '#7C3AED');
    assert.equal(brandInDb.secondaryColor, '#0EA5E9');
    assert.equal(brandInDb.industry, 'Developer Tools & SaaS');
  });

  // =========================================================================
  // 10. Retrieve application settings
  // =========================================================================
  await test('10. Retrieve application settings via GET /api/v1/settings/app (200 OK)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.timezone, 'Asia/Kolkata');
    assert.equal(body.data.defaultLanguage, 'en');
    assert.equal(body.data.timeFormat, '12h');
  });

  // =========================================================================
  // 11. Update application timezone and display preferences
  // =========================================================================
  await test('11. Update application timezone and preferences via PATCH /api/v1/settings/app (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        timezone: 'America/New_York',
        timeFormat: '24h',
        dateFormat: 'YYYY-MM-DD',
        defaultView: 'week',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.timezone, 'America/New_York');
    assert.equal(body.data.timeFormat, '24h');
    assert.equal(body.data.defaultView, 'week');
  });

  // =========================================================================
  // 12. Reject invalid timezone identifiers
  // =========================================================================
  await test('12. Reject invalid timezone identifiers with 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        timezone: 'Invalid/Not_A_Timezone_At_All',
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.ok(
      body.issues && body.issues.some((i: any) => i.path === 'timezone' && /Invalid IANA time zone/i.test(i.message)),
      'Must return Zod validation error for invalid timezone'
    );
  });

  // =========================================================================
  // 13. Confirm timezone updates do not rewrite stored scheduled timestamps
  // =========================================================================
  await test('13. Timezone updates do not alter stored UTC schedule timestamps', async () => {
    // Create a scheduled post with known UTC instant
    const fixedUtcTime = new Date('2027-06-15T10:00:00.000Z');
    const testPost = await prisma.contentPost.create({
      data: {
        title: 'Timezone Invariant Post',
        caption: 'Testing UTC storage invariance across timezone config updates',
        status: PostStatus.SCHEDULED,
        scheduledAt: fixedUtcTime,
        createdById: ownerUser.id,
        brandSettingsId: initialBrand.id,
        schedules: {
          create: {
            scheduledAt: fixedUtcTime,
            status: 'SCHEDULED',
          },
        },
      },
      include: { schedules: true },
    });

    const initialScheduleId = testPost.schedules[0].id;

    // Update app timezone to Europe/London
    const tzRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { timezone: 'Europe/London' },
    });
    assert.equal(tzRes.statusCode, 200);

    // Re-query the scheduled post and content schedule from database
    const verifySchedule = await prisma.contentSchedule.findUniqueOrThrow({
      where: { id: initialScheduleId },
    });
    assert.equal(
      verifySchedule.scheduledAt.toISOString(),
      '2027-06-15T10:00:00.000Z',
      'Database stored schedule instant must remain exactly unchanged in UTC'
    );

    const verifyPost = await prisma.contentPost.findUniqueOrThrow({
      where: { id: testPost.id },
    });
    assert.equal(
      verifyPost.scheduledAt?.toISOString(),
      '2027-06-15T10:00:00.000Z',
      'Database stored post scheduledAt must remain exactly unchanged in UTC'
    );

    // Reset timezone back to Asia/Kolkata
    await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { timezone: 'Asia/Kolkata' },
    });

    // Cleanup test post and schedule
    await prisma.contentSchedule.delete({ where: { id: initialScheduleId } });
    await prisma.contentPost.delete({ where: { id: testPost.id } });
  });

  // =========================================================================
  // 14. Confirm activity logs are recorded for brand and app settings changes
  // =========================================================================
  await test('14. Confirm activity logs are generated for brand and application settings changes', async () => {
    const brandLog = await prisma.activityLog.findFirst({
      where: { action: 'BRAND_SETTINGS_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(brandLog, 'BRAND_SETTINGS_UPDATED activity log must exist');
    assert.equal(brandLog.entityType, 'BRAND_SETTINGS');

    const appLog = await prisma.activityLog.findFirst({
      where: { action: 'APPLICATION_SETTINGS_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(appLog, 'APPLICATION_SETTINGS_UPDATED activity log must exist');
    assert.equal(appLog.entityType, 'APPLICATION_SETTINGS');
  });

  // =========================================================================
  // 15. Confirm failed updates do not partially modify saved settings
  // =========================================================================
  await test('15. Failed validation requests do not partially modify saved settings', async () => {
    // Current brand name
    const currentBrand = await prisma.brandSettings.findFirstOrThrow();
    const currentBrandName = currentBrand.brandName;

    // Send payload with valid brandName but invalid primaryColor
    const failRes = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/brand',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        brandName: 'Should Not Be Saved',
        primaryColor: 'not-a-color',
      },
    });
    assert.equal(failRes.statusCode, 400);

    // Verify brandName was NOT modified
    const checkBrand = await prisma.brandSettings.findUniqueOrThrow({
      where: { id: currentBrand.id },
    });
    assert.equal(checkBrand.brandName, currentBrandName, 'Brand name must not be partially updated on validation failure');
  });

  // =========================================================================
  // 16. Database singleton enforcement for BrandSettings
  // =========================================================================
  await test('16. Database singleton enforcement for BrandSettings rejects duplicate record with P2002', async () => {
    let errorCaught = false;
    try {
      await prisma.brandSettings.create({
        data: {
          brandName: 'CodeCulture', // duplicate of existing unique brand_name
          tagline: 'Duplicate CodeCulture brand attempt',
          primaryColor: '#123456',
          secondaryColor: '#654321',
        },
      });
    } catch (err: unknown) {
      errorCaught = true;
      assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal((err as Prisma.PrismaClientKnownRequestError).code, 'P2002');
    }
    assert.equal(errorCaught, true, 'Database unique constraint must reject duplicate BrandSettings record');
  });

  // =========================================================================
  // 17. Database singleton enforcement for ApplicationSettings
  // =========================================================================
  await test('17. Database singleton enforcement for ApplicationSettings rejects duplicate row with P2002', async () => {
    let errorCaught = false;
    try {
      await prisma.applicationSettings.create({
        data: {
          isSingleton: true, // violates is_singleton unique constraint
          timezone: 'UTC',
          defaultLanguage: 'en',
          timeFormat: '24h',
          dateFormat: 'YYYY-MM-DD',
          firstDayOfWeek: 1,
          defaultView: 'week',
        },
      });
    } catch (err: unknown) {
      errorCaught = true;
      assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal((err as Prisma.PrismaClientKnownRequestError).code, 'P2002');
    }
    assert.equal(errorCaught, true, 'Database unique constraint must reject duplicate ApplicationSettings row');
  });

  // =========================================================================
  // 18. Concurrent initialization protection
  // =========================================================================
  await test('18. Concurrent simultaneous calls to getBrandSettings and getApplicationSettings resolve safely', async () => {
    const brandPromises = Array.from({ length: 10 }).map(() => SettingsService.getBrandSettings());
    const appPromises = Array.from({ length: 10 }).map(() => SettingsService.getApplicationSettings());

    const brands = await Promise.all(brandPromises);
    const apps = await Promise.all(appPromises);

    assert.equal(brands.length, 10);
    assert.equal(apps.length, 10);

    // Verify all return the exact same singleton IDs
    const firstBrandId = brands[0].id;
    for (const b of brands) {
      assert.equal(b.id, firstBrandId);
    }

    const firstAppId = apps[0].id;
    for (const a of apps) {
      assert.equal(a.id, firstAppId);
    }
  });

  // =========================================================================
  // 19. No-op updates do not create activity logs
  // =========================================================================
  await test('19. No-op updates with identical values do not generate redundant activity logs', async () => {
    const currentApp = await SettingsService.getApplicationSettings();

    // Count activity logs before no-op
    const logsBefore = await prisma.activityLog.count({
      where: { entityType: 'APPLICATION_SETTINGS', entityId: currentApp.id },
    });

    // Send identical settings values
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        timezone: currentApp.timezone,
        defaultLanguage: currentApp.defaultLanguage,
        timeFormat: currentApp.timeFormat,
        dateFormat: currentApp.dateFormat,
        firstDayOfWeek: currentApp.firstDayOfWeek,
        defaultView: currentApp.defaultView,
      },
    });
    assert.equal(res.statusCode, 200);

    // Verify log count did not increase
    const logsAfter = await prisma.activityLog.count({
      where: { entityType: 'APPLICATION_SETTINGS', entityId: currentApp.id },
    });
    assert.equal(logsAfter, logsBefore, 'No-op update must not generate a new ActivityLog record');
  });

  // =========================================================================
  // 20. Real changes generate correct activity logs with updatedFields
  // =========================================================================
  await test('20. Real settings modifications generate activity logs with exact updatedFields metadata', async () => {
    const currentApp = await SettingsService.getApplicationSettings();
    const newTz = currentApp.timezone === 'UTC' ? 'Asia/Kolkata' : 'UTC';

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        timezone: newTz,
      },
    });
    assert.equal(res.statusCode, 200);

    const latestLog = await prisma.activityLog.findFirst({
      where: { entityType: 'APPLICATION_SETTINGS', entityId: currentApp.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(latestLog);
    assert.equal(latestLog.action, 'APPLICATION_SETTINGS_UPDATED');
    const meta = latestLog.metadata as Record<string, unknown>;
    assert.deepEqual(meta.updatedFields, ['timezone']);
    assert.equal(meta.newTimezone, newTz);
  });

  // =========================================================================
  // 21. Calendar API consumes persisted application timezone dynamically
  // =========================================================================
  await test('21. Calendar API retrieves and applies persisted timezone (e.g. America/New_York and UTC)', async () => {
    // 1. Set timezone to America/New_York
    await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { timezone: 'America/New_York' },
    });

    const calResNY = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2026-11-01&endDate=2026-11-30',
      headers: { cookie: ownerCookie },
    });
    assert.equal(calResNY.statusCode, 200);
    const bodyNY = JSON.parse(calResNY.body);
    assert.equal(bodyNY.data.timezone, 'America/New_York');
    // In America/New_York on 2026-11-01 (EDT UTC-4), midnight corresponds to 04:00 UTC
    assert.equal(bodyNY.data.range.startDate, '2026-11-01T04:00:00.000Z');

    // 2. Set timezone to UTC
    await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { timezone: 'UTC' },
    });

    const calResUTC = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2026-11-01&endDate=2026-11-30',
      headers: { cookie: ownerCookie },
    });
    assert.equal(calResUTC.statusCode, 200);
    const bodyUTC = JSON.parse(calResUTC.body);
    assert.equal(bodyUTC.data.timezone, 'UTC');
    assert.equal(bodyUTC.data.range.startDate, '2026-11-01T00:00:00.000Z');
  });

  // =========================================================================
  // 22. America/New_York DST boundary behavior
  // =========================================================================
  await test('22. IANA timezone calculations handle America/New_York summer DST (EDT UTC-4) vs winter (EST UTC-5)', async () => {
    // Summer date: 2026-07-15 10:00 AM NY (EDT = UTC-4 -> 14:00 UTC)
    const summerUtc = ianaLocalToUtc(2026, 7, 15, 10, 0, 0, 'America/New_York');
    assert.equal(summerUtc.toISOString(), '2026-07-15T14:00:00.000Z');

    // Winter date: 2026-12-15 10:00 AM NY (EST = UTC-5 -> 15:00 UTC)
    const winterUtc = ianaLocalToUtc(2026, 12, 15, 10, 0, 0, 'America/New_York');
    assert.equal(winterUtc.toISOString(), '2026-12-15T15:00:00.000Z');
  });

  // =========================================================================
  // 23. Display preferences reflect in calendar responses
  // =========================================================================
  await test('23. Calendar responses include configured display preferences (firstDayOfWeek, timeFormat, defaultView)', async () => {
    await server.inject({
      method: 'PATCH',
      url: '/api/v1/settings/app',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        firstDayOfWeek: 1, // Monday
        defaultView: 'week',
        timeFormat: '24h',
        dateFormat: 'DD/MM/YYYY',
      },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2026-11-01&endDate=2026-11-30',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.firstDayOfWeek, 1);
    assert.equal(body.data.defaultView, 'week');
    assert.equal(body.data.timeFormat, '24h');
    assert.equal(body.data.dateFormat, 'DD/MM/YYYY');
  });

  // Cleanup: Restore original CodeCulture brand and default settings
  await prisma.brandSettings.update({
    where: { isSingleton: true },
    data: {
      brandName: 'CodeCulture',
      tagline: 'Code. Create. Build. Repeat.',
      websiteUrl: initialBrand.websiteUrl,
      primaryColor: initialBrand.primaryColor,
      secondaryColor: initialBrand.secondaryColor,
      tone: initialBrand.tone,
      audience: initialBrand.audience,
      industry: 'Developer Education & Tech Media',
      primaryLanguage: 'en',
      description: initialBrand.description,
      guidelines: initialBrand.guidelines,
    },
  });

  await prisma.applicationSettings.updateMany({
    data: {
      timezone: 'Asia/Kolkata',
      defaultLanguage: 'en',
      timeFormat: '12h',
      dateFormat: 'YYYY-MM-DD',
      defaultView: 'month',
    },
  });

  await prisma.user.deleteMany({
    where: { id: { in: [adminUser.id, editorUser.id, analystUser.id] } },
  });

  console.log('\n----------------------------------------');
  console.log(`  Settings Tests completed: 23 total`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------\n');

  await server.close();
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runSettingsTests().catch((err) => {
  console.error('Settings test execution fatal error:', err);
  process.exit(1);
});
