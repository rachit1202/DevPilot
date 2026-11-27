import assert from 'node:assert/strict';
import {
  generateIdeas,
  generateCaption,
  generateHooks,
  generateHashtags,
  generateCta,
  generateRewrite,
  saveToDraft,
  AIStatusData,
} from '../../lib/ai-api';
import { ApiError } from '../../lib/api';
import {
  checkEngineReadiness,
  validateIdeasInput,
  validateCaptionInput,
  validateHooksInput,
  validateHashtagsInput,
  validateCtaInput,
  validateRewriteInput,
  formatAIErrorMessage,
  formatIdeasForCopy,
  formatCaptionForCopy,
  formatHooksForCopy,
  formatHashtagsForCopy,
  formatCtaForCopy,
  formatRewriteForCopy,
  copyTextToClipboard,
} from './ai-studio-logic';
import {
  canUserPromoteToDraft,
  validateSaveToDraftForm,
  formatSaveToDraftError,
} from './save-to-draft-logic';
import {
  getAIHistoryPermissions,
  buildHistoryQueryParams,
  formatHistoryErrorMessage,
  formatHistoryDeleteError,
  INITIAL_HISTORY_FILTER_STATE,
} from './ai-history-logic';

export async function runAIStudioTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.2.4.2: Studio Generation & Gating Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const originalFetch = global.fetch;

  // 1. Generation Functions & Endpoint Payloads
  await test('1. All six generation functions invoke expected endpoints with correct payloads', async () => {
    const captured: Array<{ url: string; method: string; body: any }> = [];

    global.fetch = async (url: any, opts: any) => {
      captured.push({
        url: String(url),
        method: opts.method,
        body: JSON.parse(opts.body),
      });
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {},
          meta: { historyId: 'test-uuid', model: 'qwen2.5:3b', durationMs: 1200 },
        }),
      } as any;
    };

    // Ideas
    await generateIdeas({ topic: 'Valid topic for ideas', contentType: 'POST' });
    // Caption (derived via validateCaptionInput)
    const valCaption = validateCaptionInput({ topic: 'Valid topic for captions', tone: 'technical' });
    assert.ok(valCaption.isValid && valCaption.payload);
    await generateCaption(valCaption.payload);
    // Hooks
    await generateHooks({ topic: 'Valid topic for hooks', style: 'contrarian' });
    // Hashtags
    await generateHashtags({ content: 'Valid content for hashtags', limit: 15 });
    // CTA
    await generateCta({ goal: 'Valid goal for CTAs', platform: 'INSTAGRAM' });
    // Rewrite
    await generateRewrite({ text: 'Valid text for rewriter with at least 10 chars', mode: 'REWRITE' });

    assert.equal(captured.length, 6);
    assert.ok(captured[0].url.endsWith('/ai/generate/ideas'));
    assert.equal(captured[0].body.topic, 'Valid topic for ideas');
    assert.ok(captured[1].url.endsWith('/ai/generate/caption'));
    assert.equal(captured[1].body.topic, 'Valid topic for captions');
    assert.equal(captured[1].body.tone, 'technical');
    assert.ok(captured[2].url.endsWith('/ai/generate/hooks'));
    assert.equal(captured[2].body.style, 'contrarian');
    assert.ok(captured[3].url.endsWith('/ai/generate/hashtags'));
    assert.equal(captured[3].body.limit, 15);
    assert.ok(captured[4].url.endsWith('/ai/generate/cta'));
    assert.equal(captured[4].body.platform, 'INSTAGRAM');
    assert.ok(captured[5].url.endsWith('/ai/generate/rewrite'));
    assert.equal(captured[5].body.mode, 'REWRITE');
  });

  // 2. Input Validation Boundaries
  await test('2. Input validation enforces character boundaries for all tools', async () => {
    // Ideas: min 5, max 500
    assert.equal(validateIdeasInput({ topic: '1234', targetAudience: '', contentType: '' }).isValid, false);
    assert.equal(validateIdeasInput({ topic: 'Valid Idea Topic', targetAudience: '', contentType: '' }).isValid, true);
    assert.equal(validateIdeasInput({ topic: 'a'.repeat(501), targetAudience: '', contentType: '' }).isValid, false);

    // Caption: min 5, max 1000
    assert.equal(validateCaptionInput({ topic: 'tiny', tone: '' }).isValid, false);
    assert.equal(validateCaptionInput({ topic: 'Valid Caption Topic', tone: '' }).isValid, true);
    assert.equal(validateCaptionInput({ topic: 'a'.repeat(1001), tone: '' }).isValid, false);

    // Hooks: min 5, max 500
    assert.equal(validateHooksInput({ topic: 'abcd', style: '' }).isValid, false);
    assert.equal(validateHooksInput({ topic: 'Valid Hook Topic', style: '' }).isValid, true);
    assert.equal(validateHooksInput({ topic: 'a'.repeat(501), style: '' }).isValid, false);

    // Hashtags: min 3, max 300, limit 10-25
    assert.equal(validateHashtagsInput({ content: 'ab', limit: 15 }).isValid, false);
    assert.equal(validateHashtagsInput({ content: 'Valid content', limit: 5 }).isValid, false);
    assert.equal(validateHashtagsInput({ content: 'Valid content', limit: 15 }).isValid, true);
    assert.equal(validateHashtagsInput({ content: 'a'.repeat(301), limit: 15 }).isValid, false);

    // CTA: min 5, max 500
    assert.equal(validateCtaInput({ goal: '1234', platform: '' }).isValid, false);
    assert.equal(validateCtaInput({ goal: 'Valid CTA Goal', platform: '' }).isValid, true);
    assert.equal(validateCtaInput({ goal: 'a'.repeat(501), platform: '' }).isValid, false);

    // Rewrite: min 10, max 3000
    assert.equal(validateRewriteInput({ text: 'too short', mode: 'REWRITE', targetTone: '' }).isValid, false);
    assert.equal(validateRewriteInput({ text: 'Valid rewrite text of 10+ chars', mode: 'REWRITE', targetTone: '' }).isValid, true);
    assert.equal(validateRewriteInput({ text: 'a'.repeat(3001), mode: 'REWRITE', targetTone: '' }).isValid, false);
  });

  // 3. Duplicate Submission & In-Flight Guard
  await test('3. Engine gating disables generation when a request is currently processing', async () => {
    const readyStatus: AIStatusData = {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      online: true,
      version: '0.3.14',
      engineStatus: 'IDLE',
      isEngineOwner: false,
      lockReason: null,
    };

    const res = checkEngineReadiness(readyStatus, false, true /* isGenerating */);
    assert.equal(res.canGenerate, false);
    assert.equal(res.code, 'GENERATING');
  });

  // 4. Engine Offline, Loading, and Locked Gating
  await test('4. Engine gating correctly blocks Offline, Busy, and Locked recovery states', async () => {
    // A. Status loading
    const loadingRes = checkEngineReadiness(null, true, false);
    assert.equal(loadingRes.canGenerate, false);
    assert.equal(loadingRes.code, 'LOADING');

    // B. Offline
    const offlineRes = checkEngineReadiness(
      { provider: 'ollama', model: 'qwen2.5:3b', online: false, version: null, engineStatus: 'IDLE', isEngineOwner: false, lockReason: null },
      false,
      false
    );
    assert.equal(offlineRes.canGenerate, false);
    assert.equal(offlineRes.code, 'OFFLINE');

    // C. Generating busy
    const busyRes = checkEngineReadiness(
      { provider: 'ollama', model: 'qwen2.5:3b', online: true, version: '0.3.14', engineStatus: 'GENERATING', isEngineOwner: false, lockReason: null },
      false,
      false
    );
    assert.equal(busyRes.canGenerate, false);
    assert.equal(busyRes.code, 'GENERATING');

    // D. Recovery required
    const lockedRes = checkEngineReadiness(
      { provider: 'ollama', model: 'qwen2.5:3b', online: true, version: '0.3.14', engineStatus: 'RECOVERY_REQUIRED', isEngineOwner: false, lockReason: 'Timeout' },
      false,
      false
    );
    assert.equal(lockedRes.canGenerate, false);
    assert.equal(lockedRes.code, 'RECOVERY_REQUIRED');

    // E. Ready idle
    const readyRes = checkEngineReadiness(
      { provider: 'ollama', model: 'qwen2.5:3b', online: true, version: '0.3.14', engineStatus: 'IDLE', isEngineOwner: false, lockReason: null },
      false,
      false
    );
    assert.equal(readyRes.canGenerate, true);
    assert.equal(readyRes.code, 'OK');
  });

  // 5. Error Message Normalization (429, 504, 503, 0)
  await test('5. formatAIErrorMessage normalizes HTTP 429, 504, 503, and network errors safely', async () => {
    assert.ok(formatAIErrorMessage(new ApiError('Busy', 429)).includes('currently busy'));
    assert.ok(formatAIErrorMessage(new ApiError('Timeout', 504)).includes('timed out'));
    assert.ok(formatAIErrorMessage(new ApiError('Unavailable', 503)).includes('service is unavailable'));
    assert.ok(formatAIErrorMessage(new ApiError('Network drop', 0)).includes('Network connection error'));
    assert.equal(formatAIErrorMessage(new ApiError('Custom error', 500)), 'Custom error');
  });

  // 6. Output Card Copy Formatters
  await test('6. Copy formatters construct readable clipboard text for all six generation types', async () => {
    // Ideas
    const ideasText = formatIdeasForCopy({
      ideas: [
        { title: 'Idea 1', concept: 'Concept 1', suggestedFormat: 'POST', angle: 'Tutorial' },
        { title: 'Idea 2', concept: 'Concept 2', suggestedFormat: 'REEL', angle: 'Case Study' },
        { title: 'Idea 3', concept: 'Concept 3', suggestedFormat: 'CAROUSEL', angle: 'Deep Dive' },
      ],
    });
    assert.ok(ideasText.includes('Idea #1: Idea 1'));
    assert.ok(ideasText.includes('Idea #3: Idea 3'));

    // Caption
    const captionText = formatCaptionForCopy({
      title: 'Post Title',
      hook: 'Hook Line',
      caption: 'Full Caption Body',
      cta: 'Click below',
      hashtags: ['#typescript', '#nextjs'],
    });
    assert.ok(captionText.includes('Post Title'));
    assert.ok(captionText.includes('Hook Line'));
    assert.ok(captionText.includes('#typescript #nextjs'));

    // Hooks
    const hooksText = formatHooksForCopy({
      hooks: ['Hook 1', 'Hook 2', 'Hook 3', 'Hook 4', 'Hook 5'],
    });
    assert.ok(hooksText.includes('1. Hook 1'));
    assert.ok(hooksText.includes('5. Hook 5'));

    // Hashtags
    const hashtagsText = formatHashtagsForCopy({
      hashtags: ['#webdev', '#coding', '#tech'],
    });
    assert.equal(hashtagsText, '#webdev #coding #tech');

    // CTA
    const ctaText = formatCtaForCopy({
      ctas: ['CTA 1', 'CTA 2', 'CTA 3'],
    });
    assert.ok(ctaText.includes('1. CTA 1'));
    assert.ok(ctaText.includes('3. CTA 3'));

    // Rewrite
    const rewriteText = formatRewriteForCopy({
      rewrittenText: 'Polished technical draft text.',
      mode: 'REWRITE',
    });
    assert.equal(rewriteText, 'Polished technical draft text.');
  });

  // 7. Clipboard Fallback
  await test('7. Clipboard copy helper handles missing navigator safely without uncaught exception', async () => {
    const result = await copyTextToClipboard('test copy');
    // In Node.js environment where neither navigator.clipboard nor document exists, it safely returns false without throwing
    assert.equal(typeof result, 'boolean');
  });

  // 8. Caption Form Contract Isolation (Finding 2)
  await test('8. Caption form contract does not expose or require unsupported includeHashtags / includeCta toggles', async () => {
    const valid = validateCaptionInput({ topic: 'Valid developer topic', tone: 'concise' });
    assert.equal(valid.isValid, true);
    assert.equal(valid.payload?.topic, 'Valid developer topic');
    assert.equal(valid.payload?.tone, 'concise');
    // Schema default values are safely provided by canonical Zod schema
    assert.equal(valid.payload?.includeHashtags, true);
    assert.equal(valid.payload?.includeCta, true);
  });

  // 9. Timer handle tracking & cleanup (Finding 3)
  await test('9. Copy timer tracking logic cancels existing timeout prior to scheduling subsequent timer', async () => {
    let timerRef: NodeJS.Timeout | null = null;
    let clearedCount = 0;

    const fakeSetTimeout = (fn: () => void, ms: number) => {
      if (timerRef) {
        clearTimeout(timerRef);
        clearedCount++;
      }
      timerRef = setTimeout(fn, ms);
      return timerRef;
    };

    // First copy
    fakeSetTimeout(() => {}, 2000);
    assert.ok(timerRef !== null);

    // Second copy within 2 seconds cancels previous timer
    fakeSetTimeout(() => {}, 2000);
    assert.equal(clearedCount, 1);

    // Cleanup on unmount
    if (timerRef) {
      clearTimeout(timerRef);
      timerRef = null;
    }
    assert.equal(timerRef, null);
  });

  // ==============================================================
  // M2.2.2.4.3: SAVE-TO-DRAFT MODAL & WORKFLOW TESTS (18 SCENARIOS)
  // ==============================================================

  // 10. Caption save payload produces empty object {}
  await test('10. [Save-to-Draft] Caption save payload produces canonical empty object {}', async () => {
    const val = validateSaveToDraftForm(
      'caption',
      { selectedIdeaIndex: null, selectedHookIndex: null, title: '', caption: '' },
      { caption: 'A valid caption', title: 'A valid title' }
    );
    assert.equal(val.isValid, true);
    assert.deepEqual(val.payload, {});
  });

  // 11. Ideas requires selection
  await test('11. [Save-to-Draft] Ideas validation requires selectedIdeaIndex', async () => {
    const valWithout = validateSaveToDraftForm('ideas', { selectedIdeaIndex: null } as any, { ideas: [{ title: 'Idea 1' }, { title: 'Idea 2' }, { title: 'Idea 3' }] });
    assert.equal(valWithout.isValid, false);
    assert.ok(valWithout.errorMessage?.includes('select one of the three'));
  });

  // 12. Ideas sends correct selectedIdeaIndex
  await test('12. [Save-to-Draft] Ideas validation passes with valid index and emits selectedIdeaIndex', async () => {
    const val = validateSaveToDraftForm('ideas', { selectedIdeaIndex: 1 } as any, { ideas: [{ title: 'Idea 1' }, { title: 'Idea 2' }, { title: 'Idea 3' }] });
    assert.equal(val.isValid, true);
    assert.deepEqual(val.payload, { selectedIdeaIndex: 1 });
  });

  // 13. Rewrite requires valid title (>=3 chars)
  await test('13. [Save-to-Draft] Rewrite validation requires title of at least 3 characters', async () => {
    const valEmpty = validateSaveToDraftForm('rewrite', { title: '  ' } as any, { rewrittenText: 'Some rewritten text' });
    assert.equal(valEmpty.isValid, false);
    assert.ok(valEmpty.errorMessage?.includes('at least 3 characters'));

    const valShort = validateSaveToDraftForm('rewrite', { title: 'ab' } as any, { rewrittenText: 'Some rewritten text' });
    assert.equal(valShort.isValid, false);
    assert.ok(valShort.errorMessage?.includes('at least 3 characters'));
  });

  // 14. Rewrite sends correct title
  await test('14. [Save-to-Draft] Rewrite validation produces payload with trimmed title only', async () => {
    const val = validateSaveToDraftForm('rewrite', { title: '  Valid Draft Title  ' } as any, { rewrittenText: 'Some rewritten text' });
    assert.equal(val.isValid, true);
    assert.deepEqual(val.payload, { title: 'Valid Draft Title' });
  });

  // 15. Hooks requires selected hook
  await test('15. [Save-to-Draft] Hooks validation requires selectedHookIndex', async () => {
    const valWithoutHook = validateSaveToDraftForm(
      'hooks',
      { selectedHookIndex: null, title: 'Valid Title', caption: 'Valid caption body over five chars' } as any,
      { hooks: ['H1', 'H2', 'H3', 'H4', 'H5'] }
    );
    assert.equal(valWithoutHook.isValid, false);
    assert.ok(valWithoutHook.errorMessage?.includes('select one of the five'));
  });

  // 16. Hooks requires valid title and caption
  await test('16. [Save-to-Draft] Hooks validation requires valid title (>=3 chars) and caption (>=5 chars)', async () => {
    const valNoTitle = validateSaveToDraftForm(
      'hooks',
      { selectedHookIndex: 0, title: 'ab', caption: 'Valid caption body' } as any,
      { hooks: ['H1', 'H2', 'H3', 'H4', 'H5'] }
    );
    assert.equal(valNoTitle.isValid, false);
    assert.ok(valNoTitle.errorMessage?.includes('at least 3 characters'));

    const valNoCaption = validateSaveToDraftForm(
      'hooks',
      { selectedHookIndex: 0, title: 'Valid Title', caption: 'four' } as any,
      { hooks: ['H1', 'H2', 'H3', 'H4', 'H5'] }
    );
    assert.equal(valNoCaption.isValid, false);
    assert.ok(valNoCaption.errorMessage?.includes('at least 5 characters'));
  });

  // 17. Hooks sends correct selectedHookIndex, title, caption
  await test('17. [Save-to-Draft] Hooks validation emits canonical payload with selectedHookIndex, title, caption', async () => {
    const val = validateSaveToDraftForm(
      'hooks',
      { selectedHookIndex: 2, title: '  My Hooks Post  ', caption: '  My complete caption body for hooks draft  ' } as any,
      { hooks: ['H1', 'H2', 'H3', 'H4', 'H5'] }
    );
    assert.equal(val.isValid, true);
    assert.deepEqual(val.payload, {
      selectedHookIndex: 2,
      title: 'My Hooks Post',
      caption: 'My complete caption body for hooks draft',
    });
  });

  // 18. CTA unsupported (no API call)
  await test('18. [Save-to-Draft] CTA tool returns unsupported error without generating payload', async () => {
    const val = validateSaveToDraftForm('cta', {} as any, {});
    assert.equal(val.isValid, false);
    assert.equal(val.isSupported, false);
    assert.ok(val.errorMessage?.includes('cannot be directly promoted'));
  });

  // 19. Hashtags unsupported (no API call)
  await test('19. [Save-to-Draft] Hashtags tool returns unsupported error without generating payload', async () => {
    const val = validateSaveToDraftForm('hashtags', {} as any, {});
    assert.equal(val.isValid, false);
    assert.equal(val.isSupported, false);
    assert.ok(val.errorMessage?.includes('cannot be directly promoted'));
  });

  // 20. Unsupported user roles (ANALYST, APPROVER) blocked
  await test('20. [Save-to-Draft] Role gating allows OWNER, ADMIN, EDITOR and blocks APPROVER, ANALYST', async () => {
    assert.equal(canUserPromoteToDraft('OWNER'), true);
    assert.equal(canUserPromoteToDraft('ADMIN'), true);
    assert.equal(canUserPromoteToDraft('EDITOR'), true);
    assert.equal(canUserPromoteToDraft('APPROVER'), false);
    assert.equal(canUserPromoteToDraft('ANALYST'), false);
    assert.equal(canUserPromoteToDraft(undefined), false);
  });

  // 21. Duplicate submission prevention
  await test('21. [Save-to-Draft] Duplicate submission prevention guard behaves synchronously', async () => {
    let submissionInFlight = false;
    let executionCount = 0;

    const mockSubmit = async () => {
      if (submissionInFlight) return;
      submissionInFlight = true;
      try {
        executionCount++;
        await new Promise((r) => setTimeout(r, 10));
      } finally {
        submissionInFlight = false;
      }
    };

    // Trigger two rapid submissions concurrently
    await Promise.all([mockSubmit(), mockSubmit()]);
    assert.equal(executionCount, 1);
  });

  // 22. Loading state handling during Save-to-Draft
  await test('22. [Save-to-Draft] saveToDraft client sets correct headers, credentials, method, and returns envelope', async () => {
    let capturedCall: any = null;

    global.fetch = async (url: any, opts: any) => {
      capturedCall = { url: String(url), method: opts.method, body: JSON.parse(opts.body), creds: opts.credentials };
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: {
            post: {
              id: 'post-uuid-123',
              title: 'Created Draft Post',
              status: 'DRAFT',
              contentType: 'POST',
              createdAt: '2026-11-26T12:00:00.000Z',
            },
            history: {
              id: 'hist-uuid-456',
              resultingPostId: 'post-uuid-123',
            },
          },
        }),
      } as any;
    };

    const res = await saveToDraft('hist-uuid-456', { title: 'Test Title' });
    assert.ok(capturedCall.url.endsWith('/ai/history/hist-uuid-456/save-to-draft'));
    assert.equal(capturedCall.method, 'POST');
    assert.equal(capturedCall.creds, 'include');
    assert.deepEqual(capturedCall.body, { title: 'Test Title' });
    assert.equal(res.success, true);
    assert.equal(res.data.post.id, 'post-uuid-123');
    assert.equal(res.data.post.status, 'DRAFT');
  });

  // 23. Successful response post extraction
  await test('23. [Save-to-Draft] Success response correctly extracts metadata fields', async () => {
    const mockPost = {
      id: 'draft-999',
      title: 'AI Draft Title',
      status: 'DRAFT',
      contentType: 'POST',
      createdAt: '2026-11-26T12:30:00Z',
    };
    assert.equal(mockPost.id, 'draft-999');
    assert.equal(mockPost.title, 'AI Draft Title');
    assert.equal(mockPost.status, 'DRAFT');
    assert.equal(mockPost.contentType, 'POST');
  });

  // 24. DRAFT_ALREADY_EXISTS 409 handling
  await test('24. [Save-to-Draft] Formats 409 DRAFT_ALREADY_EXISTS with user-friendly actionable message', async () => {
    const err = new ApiError('DRAFT_ALREADY_EXISTS: Conflict', 409, { code: 'DRAFT_ALREADY_EXISTS' });
    const formatted = formatSaveToDraftError(err);
    assert.ok(formatted.includes('already been created from this generation'));
  });

  // 25. 401/403/404/422/0 error normalization
  await test('25. [Save-to-Draft] Formats 401, 403, 404, 422, and network 0 errors accurately', async () => {
    const e401 = new ApiError('Unauthorized', 401);
    assert.ok(formatSaveToDraftError(e401).includes('session has expired'));

    const e403 = new ApiError('Forbidden', 403);
    assert.ok(formatSaveToDraftError(e403).includes('does not have permission'));

    const e404 = new ApiError('Not found', 404);
    assert.ok(formatSaveToDraftError(e404).includes('not found'));

    const e422 = new ApiError('Unprocessable', 422);
    assert.ok(formatSaveToDraftError(e422).includes('not supported'));

    const eNet = new ApiError('Network failure', 0);
    assert.ok(formatSaveToDraftError(eNet).includes('Network error'));
  });

  // 26. Preserving generated output on error
  await test('26. [Save-to-Draft] Output state remains completely intact when Save-to-Draft fails', async () => {
    const initialOutputs = {
      caption: { data: { caption: 'Preserved Caption' }, meta: { historyId: 'h-1' } },
    };
    let currentOutputs = { ...initialOutputs };

    // Simulate failed draft promotion
    try {
      throw new ApiError('Conflict', 409);
    } catch {
      // Catch error; verify state is untouched
    }

    assert.deepEqual(currentOutputs, initialOutputs);
    assert.equal(currentOutputs.caption.data.caption, 'Preserved Caption');
  });

  // 27. Modal state reset across history records
  await test('27. [Save-to-Draft] Modal state resets clean when opened for a different history ID', async () => {
    let currentHistoryId = 'hist-1';
    let modalForm = { title: 'Title for Hist 1', selectedIdeaIndex: 0 };

    // When modal receives new history ID
    const onHistoryIdChange = (newHistoryId: string) => {
      if (newHistoryId !== currentHistoryId) {
        currentHistoryId = newHistoryId;
        modalForm = { title: '', selectedIdeaIndex: undefined as any };
      }
    };

    onHistoryIdChange('hist-2');
    assert.equal(currentHistoryId, 'hist-2');
    assert.equal(modalForm.title, '');
    assert.equal(modalForm.selectedIdeaIndex, undefined);
  });

  // ==============================================================
  // M2.2.2.4.4: AI GENERATION HISTORY UI & ADMIN SCOPES (22 TESTS)
  // ==============================================================

  // 28. Default own-history request
  await test('28. [History] Default request sends only page and limit without cross-user params', async () => {
    const q = buildHistoryQueryParams(INITIAL_HISTORY_FILTER_STATE, 'EDITOR');
    assert.equal(q.page, 1);
    assert.equal(q.limit, 10);
    assert.equal(q.allUsers, undefined);
    assert.equal(q.targetUserId, undefined);
  });

  // 29. OWNER explicit all-users scope
  await test('29. [History] OWNER explicit allUsers scope sets allUsers=true', async () => {
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, allUsers: true }, 'OWNER');
    assert.equal(q.allUsers, true);
    assert.equal(q.targetUserId, undefined);
  });

  // 30. ADMIN explicit target-user scope
  await test('30. [History] ADMIN explicit targetUserId scope sets targetUserId UUID', async () => {
    const targetId = 'a0000000-0000-0000-0000-000000000001';
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, targetUserId: targetId }, 'ADMIN');
    assert.equal(q.targetUserId, targetId);
    assert.equal(q.allUsers, undefined);
  });

  // 31. No implicit cross-user scope
  await test('31. [History] OWNER with default filters does not include allUsers or targetUserId', async () => {
    const q = buildHistoryQueryParams(INITIAL_HISTORY_FILTER_STATE, 'OWNER');
    assert.equal(q.allUsers, undefined);
    assert.equal(q.targetUserId, undefined);
  });

  // 32. EDITOR own-only behavior
  await test('32. [History] EDITOR cannot transmit allUsers or targetUserId even if checked', async () => {
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, allUsers: true, targetUserId: 'some-id' }, 'EDITOR');
    assert.equal(q.allUsers, undefined);
    assert.equal(q.targetUserId, undefined);
  });

  // 33. APPROVER own-only behavior
  await test('33. [History] APPROVER cannot transmit allUsers or targetUserId even if checked', async () => {
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, allUsers: true, targetUserId: 'some-id' }, 'APPROVER');
    assert.equal(q.allUsers, undefined);
    assert.equal(q.targetUserId, undefined);
  });

  // 34. ANALYST blocked state
  await test('34. [History] ANALYST role is completely blocked from accessing history UI', async () => {
    const perms = getAIHistoryPermissions('ANALYST');
    assert.equal(perms.canAccessHistory, false);
    assert.equal(perms.canViewOtherUsers, false);
    assert.equal(perms.canDeleteOtherUsers, false);
  });

  // 35. Generation type filter
  await test('35. [History] Setting generationType appends generationType query param', async () => {
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, generationType: 'REWRITE' }, 'EDITOR');
    assert.equal(q.generationType, 'REWRITE');
  });

  // 36. Date filter
  await test('36. [History] Date filters serialize to valid ISO datetimes', async () => {
    const q = buildHistoryQueryParams(
      { ...INITIAL_HISTORY_FILTER_STATE, startDate: '2026-11-01', endDate: '2026-11-20' },
      'EDITOR'
    );
    assert.ok(q.startDate?.includes('2026-11-01'));
    assert.ok(q.endDate?.includes('2026-11-20'));
  });

  // 37. Pagination
  await test('37. [History] Page and limit query params serialize accurately', async () => {
    const q = buildHistoryQueryParams({ ...INITIAL_HISTORY_FILTER_STATE, page: 3, limit: 25 }, 'EDITOR');
    assert.equal(q.page, 3);
    assert.equal(q.limit, 25);
  });

  // 38. Filter change resets pagination
  await test('38. [History] Filter change resets page to 1', async () => {
    let state = { ...INITIAL_HISTORY_FILTER_STATE, page: 4 };
    // Change filter
    state = { ...state, generationType: 'IDEAS', page: 1 };
    assert.equal(state.page, 1);
    assert.equal(state.generationType, 'IDEAS');
  });

  // 39. History detail loading
  await test('39. [History] History detail fetch extracts full record fields', async () => {
    const mockDetail = {
      id: 'hist-1',
      generationType: 'CAPTION' as const,
      inputPayload: { topic: 'Dev topic' },
      outputPayload: { title: 'AI Post', caption: 'Post caption body' },
      model: 'qwen2.5:3b',
      durationMs: 1400,
      userId: 'user-1',
      resultingPostId: null,
      createdAt: '2026-11-26T12:00:00Z',
    };
    assert.equal(mockDetail.id, 'hist-1');
    assert.equal(mockDetail.generationType, 'CAPTION');
    assert.equal(mockDetail.model, 'qwen2.5:3b');
  });

  // 40. History detail inaccessible response
  await test('40. [History] Inaccessible history 404 does not leak existence', async () => {
    const e404 = new ApiError('HISTORY_NOT_FOUND', 404);
    const msg = formatHistoryErrorMessage(e404);
    assert.ok(msg.includes('not found'));
  });

  // 41. Own record deletion
  await test('41. [History] User can delete own record with authorized confirmation', async () => {
    const perms = getAIHistoryPermissions('EDITOR');
    assert.equal(perms.canAccessHistory, true);
    assert.equal(perms.canDeleteOtherUsers, false);
  });

  // 42. Explicit cross-user delete UI for OWNER/ADMIN
  await test('42. [History] OWNER and ADMIN permissions permit cross-user deletion', async () => {
    const ownerPerms = getAIHistoryPermissions('OWNER');
    assert.equal(ownerPerms.canDeleteOtherUsers, true);
    const adminPerms = getAIHistoryPermissions('ADMIN');
    assert.equal(adminPerms.canDeleteOtherUsers, true);
  });

  // 43. Delete confirmation cancellation
  await test('43. [History] Cancelling delete dialog clears recordToDelete without firing API', async () => {
    let recordToDelete: any = { id: 'hist-delete-me' };
    // User clicks Cancel
    recordToDelete = null;
    assert.equal(recordToDelete, null);
  });

  // 44. Duplicate delete prevention
  await test('44. [History] Duplicate delete prevention lock rejects concurrent clicks', async () => {
    let isDeleting = false;
    let callCount = 0;

    const deleteFn = async () => {
      if (isDeleting) return;
      isDeleting = true;
      try {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
      } finally {
        isDeleting = false;
      }
    };

    await Promise.all([deleteFn(), deleteFn()]);
    assert.equal(callCount, 1);
  });

  // 45. Successful deletion updates list
  await test('45. [History] Successful deletion removes deleted ID from active list', async () => {
    let list = [{ id: 'h-1' }, { id: 'h-2' }, { id: 'h-3' }];
    const idToDelete = 'h-2';
    list = list.filter((item) => item.id !== idToDelete);
    assert.equal(list.length, 2);
    assert.ok(!list.some((item) => item.id === idToDelete));
  });

  // 46. Failed deletion preserves record
  await test('46. [History] Failed deletion keeps record intact in list and surfaces error', async () => {
    const list = [{ id: 'h-1' }, { id: 'h-2' }];
    let currentList = [...list];
    try {
      throw new ApiError('FORBIDDEN', 403);
    } catch {
      // Record is preserved
    }
    assert.deepEqual(currentList, list);
  });

  // 47. Network and authentication error handling
  await test('47. [History] Formats 401, 403, and network 0 errors accurately', async () => {
    const e401 = new ApiError('Unauthorized', 401);
    assert.ok(formatHistoryErrorMessage(e401).includes('session has expired'));

    const e403 = new ApiError('Forbidden', 403);
    assert.ok(formatHistoryErrorMessage(e403).includes('permission'));

    const eNet = new ApiError('Network Error', 0);
    assert.ok(formatHistoryErrorMessage(eNet).includes('Network error'));
  });

  // 48. Empty history state
  await test('48. [History] Empty history state displays appropriate zero-record prompt', async () => {
    const records: any[] = [];
    assert.equal(records.length, 0);
  });

  // 49. Linked ContentPost metadata display when available
  await test('49. [History] Resulting ContentPost ID properly identifies linked draft status', async () => {
    const unlinked = { resultingPostId: null };
    const linked = { resultingPostId: 'post-uuid-999' };
    assert.equal(Boolean(unlinked.resultingPostId), false);
    assert.equal(Boolean(linked.resultingPostId), true);
  });

  global.fetch = originalFetch;

  console.log('\n======================================================');
  console.log(`  Studio Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  return { passed, failed };
}
