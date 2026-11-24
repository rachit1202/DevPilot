import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { AIService } from '../src/modules/ai/ai.service';
import { OllamaClient, OllamaProviderError } from '../src/modules/ai/providers/ollama.client';

async function runAITests() {
  console.log('\n======================================================');
  console.log('  DevPilot Milestone 2.1: Ollama & AI Provider Tests');
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
  async function loginAsOwner(): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email: ownerEmail, password: ownerPassword },
    });
    assert.equal(res.statusCode, 200, 'Owner login should succeed');
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  const ownerCookie = await loginAsOwner();

  // Test 1: Unauthenticated request to /api/v1/ai/status is rejected (401)
  await test('1. Unauthenticated request to /api/v1/ai/status returns 401 Unauthorized', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
  });

  // Test 2: Ollama offline / unreachable returns safe 200 response with available=false
  await test('2. Ollama unreachable: Returns safe offline state (available: false) without crashing', async () => {
    class OfflineOllamaClient extends OllamaClient {
      async ping(): Promise<boolean> {
        return false;
      }
    }

    AIService.setClient(new OfflineOllamaClient('http://127.0.0.1:11434'));

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.available, false);
    assert.equal(body.data.primaryModelInstalled, false);
    assert.equal(body.data.fallbackModelInstalled, false);
    assert.ok(body.data.message.includes('unreachable'));
  });

  // Test 3: Ollama online with both primary and fallback models installed
  await test('3. Ollama online & models installed: Returns available: true and reports installed status', async () => {
    class MockOnlineClient extends OllamaClient {
      async ping(): Promise<boolean> {
        return true;
      }
      async getVersion(): Promise<string> {
        return '0.5.1';
      }
      async listInstalledModels(): Promise<string[]> {
        return ['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:1b'];
      }
    }

    AIService.setClient(new MockOnlineClient('http://127.0.0.1:11434'));

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.available, true);
    assert.equal(body.data.ollamaVersion, '0.5.1');
    assert.equal(body.data.primaryModelInstalled, true);
    assert.equal(body.data.fallbackModelInstalled, true);
    assert.deepEqual(body.data.installedModels, ['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:1b']);
    assert.ok(body.data.message.includes('ready'));
  });

  // Test 4: Ollama online but configured model is missing
  await test('4. Primary model missing: Returns available: true, but primaryModelInstalled: false with pull suggestion', async () => {
    class MissingModelClient extends OllamaClient {
      async ping(): Promise<boolean> {
        return true;
      }
      async getVersion(): Promise<string> {
        return '0.5.1';
      }
      async listInstalledModels(): Promise<string[]> {
        return ['mistral:7b'];
      }
    }

    AIService.setClient(new MissingModelClient('http://127.0.0.1:11434'));

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.available, true);
    assert.equal(body.data.primaryModelInstalled, false);
    assert.equal(body.data.fallbackModelInstalled, false);
    assert.ok(body.data.message.includes('ollama pull'));
  });

  // Test 5: Fallback model installed while primary is missing
  await test('5. Model tag exact matching: Recognizes fallback installed even when primary is missing', async () => {
    class FallbackOnlyClient extends OllamaClient {
      async ping(): Promise<boolean> {
        return true;
      }
      async getVersion(): Promise<string> {
        return '0.5.1';
      }
      async listInstalledModels(): Promise<string[]> {
        return ['qwen2.5:1.5b'];
      }
    }

    AIService.setClient(new FallbackOnlyClient('http://127.0.0.1:11434'));

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.primaryModelInstalled, false);
    assert.equal(body.data.fallbackModelInstalled, true);
  });

  // Test 6: Malformed response handling in model discovery
  await test('6. Malformed response handling: Model discovery failure fails gracefully with safe offline message', async () => {
    class MalformedClient extends OllamaClient {
      async ping(): Promise<boolean> {
        return true;
      }
      async listInstalledModels(): Promise<string[]> {
        throw new OllamaProviderError('Malformed JSON payload from Ollama', 'OLLAMA_HTTP_ERROR');
      }
    }

    AIService.setClient(new MalformedClient('http://127.0.0.1:11434'));

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.available, false);
    assert.ok(body.data.message.includes('failed to retrieve model catalog'));
  });

  // Test 7: Concurrency lock / readiness check
  await test('7. Concurrency guard check: isBusy() returns false by default', async () => {
    assert.equal(AIService.isBusy(), false);
  });

  // Reset to default client
  AIService.resetClient();
  await server.close();

  console.log('\n------------------------------------------------------');
  console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAITests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
