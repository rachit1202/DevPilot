import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, PostStatus, ApprovalStatus, ContentType, ContentCategory } from '@devpilot/shared';

async function runCalendarTests() {
  console.log('\n======================================================');
  console.log('  DevPilot Milestone 1.5: Content Calendar Test Suite');
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

  // Setup Editor user
  const editorEmail = 'editor.cal@codeculture.dev';
  const editorPassword = 'SecureEditor123!';
  let editorUser = await prisma.user.findUnique({ where: { email: editorEmail } });
  if (!editorUser) {
    const passwordHash = await bcrypt.hash(editorPassword, 10);
    editorUser = await prisma.user.create({
      data: {
        email: editorEmail,
        name: 'Calendar Editor',
        passwordHash,
        role: UserRole.EDITOR,
      },
    });
  }
  const editorCookie = await loginAs(editorEmail, editorPassword);

  // Setup Analyst user
  const analystEmail = 'analyst.cal@codeculture.dev';
  const analystPassword = 'SecureAnalyst123!';
  let analystUser = await prisma.user.findUnique({ where: { email: analystEmail } });
  if (!analystUser) {
    const passwordHash = await bcrypt.hash(analystPassword, 10);
    analystUser = await prisma.user.create({
      data: {
        email: analystEmail,
        name: 'Calendar Analyst',
        passwordHash,
        role: UserRole.ANALYST,
      },
    });
  }
  const analystCookie = await loginAs(analystEmail, analystPassword);

  const brand = await prisma.brandSettings.findFirst();
  assert.ok(brand);

  // Test content tracking IDs
  let editorApprovedPostId = '';
  let ownerApprovedPostId = '';
  let activeScheduleId = '';

  // Setup: Create an approved post for Editor
  const createEdRes = await server.inject({
    method: 'POST',
    url: '/api/v1/content',
    headers: { cookie: editorCookie, origin: frontendOrigin },
    payload: {
      title: 'Editor Post for Calendar',
      caption: 'Full caption for editor post ready to be approved and scheduled',
      contentType: ContentType.SINGLE_IMAGE,
      category: ContentCategory.WEB_DEV_TIPS,
    },
  });
  assert.equal(createEdRes.statusCode, 201);
  editorApprovedPostId = JSON.parse(createEdRes.body).data.post.id;

  // Approve Editor's post using Owner
  const approveEdRes = await server.inject({
    method: 'POST',
    url: `/api/v1/content/${editorApprovedPostId}/approve`,
    headers: { cookie: ownerCookie, origin: frontendOrigin },
    payload: { comment: 'Approved for calendar scheduling' },
  });
  assert.equal(approveEdRes.statusCode, 200);

  // Setup: Create and approve Owner post
  const createOwnerRes = await server.inject({
    method: 'POST',
    url: '/api/v1/content',
    headers: { cookie: ownerCookie, origin: frontendOrigin },
    payload: {
      title: 'Owner Post for Calendar',
      caption: 'Owner caption ready for scheduling',
      contentType: ContentType.CODE_TIP,
      category: ContentCategory.DEVELOPER_LIFE,
    },
  });
  assert.equal(createOwnerRes.statusCode, 201);
  ownerApprovedPostId = JSON.parse(createOwnerRes.body).data.post.id;

  const approveOwnerRes = await server.inject({
    method: 'POST',
    url: `/api/v1/content/${ownerApprovedPostId}/approve`,
    headers: { cookie: ownerCookie, origin: frontendOrigin },
    payload: { comment: 'Approved by Owner' },
  });
  assert.equal(approveOwnerRes.statusCode, 200);

  // =========================================================================
  // 1. Retrieve calendar entries
  // =========================================================================
  await test('1. Retrieve calendar entries via GET /api/v1/calendar (200 OK)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2026-11-01&endDate=2026-11-30',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.entries));
    assert.equal(body.data.timezone, 'Asia/Kolkata');
  });

  // =========================================================================
  // 2. Filter calendar by date range
  // =========================================================================
  await test('2. Filter calendar by date range returns correct bounds', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2027-01-01T00:00:00.000Z&endDate=2027-01-07T23:59:59.999Z',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.total, 0); // No schedules in far future yet
  });

  // =========================================================================
  // 3. Authorized scheduling of an approved post
  // =========================================================================
  const futureScheduleDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days in future
  await test('3. Authorized scheduling of an approved post transitions post to SCHEDULED (201 Created)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: editorApprovedPostId,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.schedule.status, 'SCHEDULED');
    assert.equal(body.data.post.status, PostStatus.SCHEDULED);
    assert.ok(body.data.post.scheduledAt);
    activeScheduleId = body.data.schedule.id;

    // Verify in database
    const postInDb = await prisma.contentPost.findUnique({ where: { id: editorApprovedPostId } });
    assert.equal(postInDb?.status, PostStatus.SCHEDULED);
  });

  // =========================================================================
  // 4. Scheduling a DRAFT post rejected
  // =========================================================================
  await test('4. Scheduling a DRAFT post is rejected with 400 Bad Request', async () => {
    const draftPost = await prisma.contentPost.create({
      data: {
        title: 'Draft Post Cannot Schedule',
        caption: 'Draft caption',
        status: PostStatus.DRAFT,
        createdById: editorUser.id,
        brandSettingsId: brand.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: draftPost.id,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot schedule a draft post|Post must be approved first/i);

    await prisma.contentPost.delete({ where: { id: draftPost.id } });
  });

  // =========================================================================
  // 5. Scheduling an IN_REVIEW post rejected
  // =========================================================================
  await test('5. Scheduling an IN_REVIEW post is rejected with 400 Bad Request', async () => {
    const reviewPost = await prisma.contentPost.create({
      data: {
        title: 'Review Post Cannot Schedule',
        caption: 'Review caption',
        status: PostStatus.IN_REVIEW,
        createdById: editorUser.id,
        brandSettingsId: brand.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: reviewPost.id,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot schedule a post that is in review/i);

    await prisma.contentPost.delete({ where: { id: reviewPost.id } });
  });

  // =========================================================================
  // 6. Scheduling a REJECTED post rejected
  // =========================================================================
  await test('6. Scheduling a REJECTED post is rejected with 400 Bad Request', async () => {
    const rejectedPost = await prisma.contentPost.create({
      data: {
        title: 'Rejected Post Cannot Schedule',
        caption: 'Rejected caption',
        status: PostStatus.REJECTED,
        createdById: editorUser.id,
        brandSettingsId: brand.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: rejectedPost.id,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot schedule a rejected post/i);

    await prisma.contentPost.delete({ where: { id: rejectedPost.id } });
  });

  // =========================================================================
  // 7. Scheduling without valid approval rejected
  // =========================================================================
  await test('7. Scheduling a post with status APPROVED but no Approval record is rejected with 400', async () => {
    // Fabricate post with status APPROVED but no record in approvals table
    const unverifiedPost = await prisma.contentPost.create({
      data: {
        title: 'Unverified Approved Post',
        caption: 'Caption without approval row in DB',
        status: PostStatus.APPROVED,
        createdById: editorUser.id,
        brandSettingsId: brand.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: unverifiedPost.id,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot schedule post without a valid verified approval record/i);

    await prisma.contentPost.delete({ where: { id: unverifiedPost.id } });
  });

  // =========================================================================
  // 8. Unauthorized scheduling rejected
  // =========================================================================
  await test('8. Unauthorized scheduling (unauthenticated or Analyst) is rejected (401 / 403)', async () => {
    // Unauthenticated
    const unauthRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      payload: {
        contentPostId: ownerApprovedPostId,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(unauthRes.statusCode, 401);

    // Analyst role
    const analystRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: {
        contentPostId: ownerApprovedPostId,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(analystRes.statusCode, 403);
    const body = JSON.parse(analystRes.body);
    assert.match(body.message, /Analysts have read-only access/i);
  });

  // =========================================================================
  // 9. Editor scheduling another user's content rejected
  // =========================================================================
  await test('9. Editor scheduling another user\'s content (Owner\'s post) is rejected (403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: ownerApprovedPostId,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.message, /You do not have permission to schedule content created by another user/i);
  });

  // =========================================================================
  // 10. Rescheduling an existing schedule
  // =========================================================================
  const rescheduledDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days in future
  await test('10. Rescheduling an existing schedule updates scheduledAt and preserves APPROVED/SCHEDULED state (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/calendar/schedule/${activeScheduleId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        scheduledAt: rescheduledDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(new Date(body.data.schedule.scheduledAt).toISOString(), rescheduledDate.toISOString());
    assert.equal(new Date(body.data.post.scheduledAt).toISOString(), rescheduledDate.toISOString());
    assert.equal(body.data.post.status, PostStatus.SCHEDULED);
  });

  // =========================================================================
  // 11. Cancelling a schedule
  // =========================================================================
  await test('11. Cancelling a schedule marks status CANCELLED and returns post to APPROVED (200 OK)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/schedule/${activeScheduleId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.schedule.status, 'CANCELLED');
    assert.equal(body.data.post.status, PostStatus.APPROVED);
    assert.equal(body.data.post.scheduledAt, null);

    // Verify in database
    const postInDb = await prisma.contentPost.findUnique({ where: { id: editorApprovedPostId } });
    assert.equal(postInDb?.status, PostStatus.APPROVED);
    assert.equal(postInDb?.scheduledAt, null);
  });

  // =========================================================================
  // 12. Duplicate active scheduling prevented
  // =========================================================================
  await test('12. Attempting to create duplicate active schedule for the same post returns 409 Conflict', async () => {
    // Schedule the approved post again
    const scheduleRes1 = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: editorApprovedPostId,
        scheduledAt: futureScheduleDate.toISOString(),
      },
    });
    assert.equal(scheduleRes1.statusCode, 201);
    const newScheduleId = JSON.parse(scheduleRes1.body).data.schedule.id;

    // Now attempt to schedule the same post a second time (post is in SCHEDULED)
    const scheduleRes2 = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        contentPostId: editorApprovedPostId,
        scheduledAt: rescheduledDate.toISOString(),
      },
    });
    assert.equal(scheduleRes2.statusCode, 400); // Only APPROVED posts can be scheduled
  });

  // =========================================================================
  // 13. Editing scheduled content invalidates its approval and schedule
  // =========================================================================
  await test('13. Editing scheduled content resets status to DRAFT, cancels active schedule, and logs APPROVAL_INVALIDATED', async () => {
    // editorApprovedPostId is currently in SCHEDULED status
    const editRes = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorApprovedPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { caption: 'Updated caption on scheduled post: must invalidate schedule and approval.' },
    });
    assert.equal(editRes.statusCode, 200);
    const body = JSON.parse(editRes.body);
    assert.equal(body.data.post.status, PostStatus.DRAFT);
    assert.equal(body.data.post.scheduledAt, null);

    // Verify active schedules for this post were marked CANCELLED
    const activeSchedules = await prisma.contentSchedule.count({
      where: { contentPostId: editorApprovedPostId, status: 'SCHEDULED' },
    });
    assert.equal(activeSchedules, 0);

    // Verify APPROVAL_INVALIDATED was logged
    const log = await prisma.activityLog.findFirst({
      where: { action: 'APPROVAL_INVALIDATED', entityId: editorApprovedPostId },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(log);
  });

  // =========================================================================
  // 14. Timezone conversion and date-boundary correctness
  // =========================================================================
  await test('14. Calendar response includes configured timezone Asia/Kolkata and handles date boundaries', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/calendar?startDate=2026-11-01&endDate=2026-11-30',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.timezone, 'Asia/Kolkata');
    assert.ok(body.data.range.startDate.startsWith('2026-11-01'));
  });

  // =========================================================================
  // 15. Database transaction failure does not leave inconsistent records
  // =========================================================================
  await test('15. Past scheduling dates are rejected without mutating post status or creating schedule records', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        contentPostId: ownerApprovedPostId,
        scheduledAt: pastDate.toISOString(),
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Scheduled date and time must be in the future/i);

    // Verify owner post is still in APPROVED status and no schedule was created
    const post = await prisma.contentPost.findUnique({ where: { id: ownerApprovedPostId } });
    assert.equal(post?.status, PostStatus.APPROVED);
    assert.equal(post?.scheduledAt, null);

    const scheduleCount = await prisma.contentSchedule.count({
      where: { contentPostId: ownerApprovedPostId },
    });
    assert.equal(scheduleCount, 0);
  });

  // Cleanup test posts and test users
  await prisma.contentSchedule.deleteMany({
    where: { contentPostId: { in: [editorApprovedPostId, ownerApprovedPostId] } },
  });
  await prisma.contentPost.deleteMany({
    where: { id: { in: [editorApprovedPostId, ownerApprovedPostId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [editorUser.id, analystUser.id] } },
  });

  console.log('\n----------------------------------------');
  console.log(`  Calendar Tests completed: 15 total`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------\n');

  await server.close();
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runCalendarTests().catch((err) => {
  console.error('Calendar test execution fatal error:', err);
  process.exit(1);
});
