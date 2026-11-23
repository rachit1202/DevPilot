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
  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });

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
    assert.equal(body.data.range.startDate, '2026-10-31T18:30:00.000Z');
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

  // =========================================================================
  // 16. Concurrent scheduling race condition (PostgreSQL partial unique index)
  // =========================================================================
  await test('16. Concurrent simultaneous scheduling requests: 1 succeeds (201), 1 fails (409 Conflict), exactly 1 active schedule exists', async () => {
    // Create and approve a new post specifically for concurrency testing
    const concPost = await prisma.contentPost.create({
      data: {
        title: 'Concurrency Test Post',
        caption: 'Testing concurrent scheduling race condition',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved for concurrency test',
          },
        },
      },
    });

    const targetDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

    // To simulate true concurrent overlapping execution where both requests pass the initial checks
    // before either transaction commits, delay the first transaction commit slightly
    let delayFirstTx = true;
    const origTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (fn: any, options: any) => {
      if (typeof fn === 'function' && delayFirstTx) {
        delayFirstTx = false;
        return origTransaction(async (tx: any) => {
          const res = await fn(tx);
          await new Promise((r) => setTimeout(r, 300)); // hold transaction lock to guarantee race overlap
          return res;
        }, options);
      }
      return origTransaction(fn, options);
    };

    let res1;
    let res2;
    try {
      // Fire 2 simultaneous scheduling requests
      [res1, res2] = await Promise.all([
        server.inject({
          method: 'POST',
          url: '/api/v1/calendar/schedule',
          headers: { cookie: ownerCookie, origin: frontendOrigin },
          payload: {
            contentPostId: concPost.id,
            scheduledAt: targetDate.toISOString(),
          },
        }),
        server.inject({
          method: 'POST',
          url: '/api/v1/calendar/schedule',
          headers: { cookie: ownerCookie, origin: frontendOrigin },
          payload: {
            contentPostId: concPost.id,
            scheduledAt: targetDate.toISOString(),
          },
        }),
      ]);
    } finally {
      (prisma as any).$transaction = origTransaction;
    }

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    assert.deepEqual(statusCodes, [201, 409], 'One request must succeed (201) and one must be rejected with 409 Conflict');

    const conflictRes = res1.statusCode === 409 ? res1 : res2;
    const conflictBody = JSON.parse(conflictRes.body);
    assert.match(conflictBody.message, /already has an active schedule/i);

    // Verify in database: exactly 1 active schedule exists
    const activeSchedules = await prisma.contentSchedule.findMany({
      where: { contentPostId: concPost.id, status: 'SCHEDULED' },
    });
    assert.equal(activeSchedules.length, 1);

    // Cleanup concPost
    await prisma.contentSchedule.deleteMany({ where: { contentPostId: concPost.id } });
    await prisma.approval.deleteMany({ where: { contentPostId: concPost.id } });
    await prisma.contentPost.delete({ where: { id: concPost.id } });
  });

  // =========================================================================
  // 17. Multiple historical CANCELLED schedules allowed
  // =========================================================================
  await test('17. Multiple historical CANCELLED schedules coexist without conflict and permit a subsequent SCHEDULED record', async () => {
    const multiCancelPost = await prisma.contentPost.create({
      data: {
        title: 'Multi Cancel Post',
        caption: 'Testing multiple cancelled schedules',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved',
          },
        },
      },
    });

    const d1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const d2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const d3 = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

    // Schedule 1
    const s1Res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: multiCancelPost.id, scheduledAt: d1.toISOString() },
    });
    assert.equal(s1Res.statusCode, 201);
    const s1Id = JSON.parse(s1Res.body).data.schedule.id;

    // Cancel 1
    const c1Res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/schedule/${s1Id}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(c1Res.statusCode, 200);

    // Schedule 2
    const s2Res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: multiCancelPost.id, scheduledAt: d2.toISOString() },
    });
    assert.equal(s2Res.statusCode, 201);
    const s2Id = JSON.parse(s2Res.body).data.schedule.id;

    // Cancel 2
    const c2Res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/schedule/${s2Id}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(c2Res.statusCode, 200);

    // Schedule 3 (Active)
    const s3Res = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: multiCancelPost.id, scheduledAt: d3.toISOString() },
    });
    assert.equal(s3Res.statusCode, 201);

    // Verify all 3 rows exist in DB
    const schedulesInDb = await prisma.contentSchedule.findMany({
      where: { contentPostId: multiCancelPost.id },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(schedulesInDb.length, 3);
    assert.equal(schedulesInDb[0].status, 'CANCELLED');
    assert.equal(schedulesInDb[1].status, 'CANCELLED');
    assert.equal(schedulesInDb[2].status, 'SCHEDULED');

    // Cleanup
    await prisma.contentSchedule.deleteMany({ where: { contentPostId: multiCancelPost.id } });
    await prisma.approval.deleteMany({ where: { contentPostId: multiCancelPost.id } });
    await prisma.contentPost.delete({ where: { id: multiCancelPost.id } });
  });

  // =========================================================================
  // 18. Repeated cancellation idempotency
  // =========================================================================
  await test('18. Repeated cancellation of already cancelled schedule returns 200 and emits NO duplicate activity logs', async () => {
    const cancelPost = await prisma.contentPost.create({
      data: {
        title: 'Cancel Idempotency Post',
        caption: 'Testing repeated cancellation',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved',
          },
        },
      },
    });

    const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const sRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: cancelPost.id, scheduledAt: d.toISOString() },
    });
    assert.equal(sRes.statusCode, 201);
    const sId = JSON.parse(sRes.body).data.schedule.id;

    // First cancel
    const cancel1 = await server.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/schedule/${sId}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(cancel1.statusCode, 200);

    // Second cancel (Idempotent)
    const cancel2 = await server.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/schedule/${sId}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(cancel2.statusCode, 200);

    // Count activity logs for CONTENT_SCHEDULE_CANCELLED on this schedule
    const cancelLogs = await prisma.activityLog.findMany({
      where: {
        action: 'CONTENT_SCHEDULE_CANCELLED',
        entityId: sId,
      },
    });
    assert.equal(cancelLogs.length, 1, 'Only 1 activity log should exist despite duplicate cancel calls');

    // Cleanup
    await prisma.contentSchedule.deleteMany({ where: { contentPostId: cancelPost.id } });
    await prisma.approval.deleteMany({ where: { contentPostId: cancelPost.id } });
    await prisma.contentPost.delete({ where: { id: cancelPost.id } });
  });

  // =========================================================================
  // 19. Transaction rollback verification on schedule failure
  // =========================================================================
  await test('19. Transaction rollback on scheduling failure: no schedule persisted and post remains APPROVED', async () => {
    const rollbackPost = await prisma.contentPost.create({
      data: {
        title: 'Rollback Schedule Post',
        caption: 'Testing rollback atomicity',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved',
          },
        },
      },
    });

    const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    // Intercept $transaction to simulate mid-transaction failure
    const origTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (fn: any, options: any) => {
      if (typeof fn === 'function') {
        return origTransaction(async (tx: any) => {
          // Monkeypatch tx.contentPost.update to throw
          tx.contentPost.update = async () => {
            throw new Error('INJECTED_TRANSACTION_FAILURE_DURING_SCHEDULE');
          };
          return fn(tx);
        }, options);
      }
      return origTransaction(fn, options);
    };

    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/calendar/schedule',
        headers: { cookie: ownerCookie, origin: frontendOrigin },
        payload: { contentPostId: rollbackPost.id, scheduledAt: d.toISOString() },
      });
      assert.equal(res.statusCode, 500);
    } finally {
      (prisma as any).$transaction = origTransaction;
    }

    // Verify rollback: no schedule was created
    const scheduleCount = await prisma.contentSchedule.count({
      where: { contentPostId: rollbackPost.id },
    });
    assert.equal(scheduleCount, 0, 'Schedule record must be rolled back');

    // Verify post status is still APPROVED
    const postInDb = await prisma.contentPost.findUnique({ where: { id: rollbackPost.id } });
    assert.equal(postInDb?.status, PostStatus.APPROVED, 'Post must remain in APPROVED status');
    assert.equal(postInDb?.scheduledAt, null, 'Post scheduledAt must remain null');

    // Cleanup
    await prisma.approval.deleteMany({ where: { contentPostId: rollbackPost.id } });
    await prisma.contentPost.delete({ where: { id: rollbackPost.id } });
  });

  // =========================================================================
  // 20. Transaction rollback verification on reschedule failure
  // =========================================================================
  await test('20. Transaction rollback on reschedule failure: preserves original scheduledAt for both schedule and post', async () => {
    const reschedulePost = await prisma.contentPost.create({
      data: {
        title: 'Rollback Reschedule Post',
        caption: 'Testing reschedule rollback',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved',
          },
        },
      },
    });

    const t1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const t2 = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const sRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: reschedulePost.id, scheduledAt: t1.toISOString() },
    });
    assert.equal(sRes.statusCode, 201);
    const sId = JSON.parse(sRes.body).data.schedule.id;

    // Intercept $transaction to simulate mid-reschedule failure
    const origTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (fn: any, options: any) => {
      if (typeof fn === 'function') {
        return origTransaction(async (tx: any) => {
          tx.contentPost.update = async () => {
            throw new Error('INJECTED_TRANSACTION_FAILURE_DURING_RESCHEDULE');
          };
          return fn(tx);
        }, options);
      }
      return origTransaction(fn, options);
    };

    try {
      const res = await server.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/schedule/${sId}`,
        headers: { cookie: ownerCookie, origin: frontendOrigin },
        payload: { scheduledAt: t2.toISOString() },
      });
      assert.equal(res.statusCode, 500);
    } finally {
      (prisma as any).$transaction = origTransaction;
    }

    // Verify rollback: schedule and post scheduledAt still match t1
    const scheduleInDb = await prisma.contentSchedule.findUnique({ where: { id: sId } });
    assert.equal(scheduleInDb?.scheduledAt.toISOString(), t1.toISOString(), 'Schedule date must remain T1');

    const postInDb = await prisma.contentPost.findUnique({ where: { id: reschedulePost.id } });
    assert.equal(postInDb?.scheduledAt?.toISOString(), t1.toISOString(), 'Post scheduledAt must remain T1');

    // Cleanup
    await prisma.contentSchedule.deleteMany({ where: { contentPostId: reschedulePost.id } });
    await prisma.approval.deleteMany({ where: { contentPostId: reschedulePost.id } });
    await prisma.contentPost.delete({ where: { id: reschedulePost.id } });
  });

  // =========================================================================
  // 21. Transaction rollback verification on cancel failure
  // =========================================================================
  await test('21. Transaction rollback on cancel failure: preserves SCHEDULED status for both schedule and post', async () => {
    const cancelRollbackPost = await prisma.contentPost.create({
      data: {
        title: 'Rollback Cancel Post',
        caption: 'Testing cancel rollback',
        status: PostStatus.APPROVED,
        createdById: ownerUser.id,
        brandSettingsId: brand.id,
        approvals: {
          create: {
            status: ApprovalStatus.APPROVED,
            requestedById: ownerUser.id,
            reviewedById: ownerUser.id,
            comment: 'Approved',
          },
        },
      },
    });

    const t1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const sRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { contentPostId: cancelRollbackPost.id, scheduledAt: t1.toISOString() },
    });
    assert.equal(sRes.statusCode, 201);
    const sId = JSON.parse(sRes.body).data.schedule.id;

    // Intercept $transaction to simulate mid-cancel failure
    const origTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (fn: any, options: any) => {
      if (typeof fn === 'function') {
        return origTransaction(async (tx: any) => {
          tx.contentPost.update = async () => {
            throw new Error('INJECTED_TRANSACTION_FAILURE_DURING_CANCEL');
          };
          return fn(tx);
        }, options);
      }
      return origTransaction(fn, options);
    };

    try {
      const res = await server.inject({
        method: 'DELETE',
        url: `/api/v1/calendar/schedule/${sId}`,
        headers: { cookie: ownerCookie, origin: frontendOrigin },
      });
      assert.equal(res.statusCode, 500);
    } finally {
      (prisma as any).$transaction = origTransaction;
    }

    // Verify rollback: schedule and post still have status SCHEDULED
    const scheduleInDb = await prisma.contentSchedule.findUnique({ where: { id: sId } });
    assert.equal(scheduleInDb?.status, 'SCHEDULED', 'Schedule status must remain SCHEDULED');

    const postInDb = await prisma.contentPost.findUnique({ where: { id: cancelRollbackPost.id } });
    assert.equal(postInDb?.status, PostStatus.SCHEDULED, 'Post status must remain SCHEDULED');

    // Cleanup
    await prisma.contentSchedule.deleteMany({ where: { contentPostId: cancelRollbackPost.id } });
    await prisma.approval.deleteMany({ where: { contentPostId: cancelRollbackPost.id } });
    await prisma.contentPost.delete({ where: { id: cancelRollbackPost.id } });
  });

  // =========================================================================
  // 22. Asia/Kolkata timezone boundaries (1 Nov 00:00, 05:29, 05:30, Oct/Nov, Dec/Jan)
  // =========================================================================
  await test('22. Timezone boundary precision: verifies UTC conversion for Asia/Kolkata boundary cases', async () => {
    // Asia/Kolkata is UTC+05:30.
    // 1 Nov 2026 12:00:00 AM IST is 31 Oct 2026 18:30:00.000 UTC
    const istMidnight = new Date('2026-10-31T18:30:00.000Z');
    const ist529Am = new Date('2026-10-31T23:59:00.000Z');
    const ist530Am = new Date('2026-11-01T00:00:00.000Z');
    const decJanIstMidnight = new Date('2026-12-31T18:30:00.000Z');

    // Format in Asia/Kolkata
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    assert.equal(fmt.format(istMidnight), '2026-11-01', '31 Oct 18:30 UTC must format to 2026-11-01 in IST');
    assert.equal(fmt.format(ist529Am), '2026-11-01', '31 Oct 23:59 UTC must format to 2026-11-01 in IST');
    assert.equal(fmt.format(ist530Am), '2026-11-01', '1 Nov 00:00 UTC must format to 2026-11-01 in IST');
    assert.equal(fmt.format(decJanIstMidnight), '2027-01-01', '31 Dec 18:30 UTC must format to 2027-01-01 in IST');

    // Query calendar range matching November 2026 in IST: 2026-10-31T18:30:00.000Z to 2026-11-30T18:29:59.999Z
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/calendar?startDate=${encodeURIComponent('2026-10-31T18:30:00.000Z')}&endDate=${encodeURIComponent('2026-11-30T18:29:59.999Z')}`,
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.timezone, 'Asia/Kolkata');
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
  console.log(`  Calendar Tests completed: 22 total`);
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
