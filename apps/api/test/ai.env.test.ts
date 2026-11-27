import assert from 'node:assert/strict';
import { z } from 'zod';

const timeoutSchema = z.coerce
  .number()
  .int('OLLAMA_TIMEOUT_MS must be an integer')
  .min(60000, 'OLLAMA_TIMEOUT_MS must be at least 60000 (1 minute)')
  .max(300000, 'OLLAMA_TIMEOUT_MS cannot exceed 300000 (5 minutes)')
  .default(120000);

async function runEnvTimeoutTests() {
  console.log('\n======================================================');
  console.log('  M2.2.1 Unit Tests: OLLAMA_TIMEOUT_MS Schema Bounds');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  test('Missing value defaults to 120000', () => {
    const res = timeoutSchema.parse(undefined);
    assert.equal(res, 120000);
  });

  test('Exact minimum 60000 is accepted', () => {
    const res = timeoutSchema.parse(60000);
    assert.equal(res, 60000);
  });

  test('Exact maximum 300000 is accepted', () => {
    const res = timeoutSchema.parse(300000);
    assert.equal(res, 300000);
  });

  test('Numeric string "150000" within bounds is parsed to integer', () => {
    const res = timeoutSchema.parse('150000');
    assert.equal(res, 150000);
  });

  test('Value below 60000 (59999) is rejected', () => {
    assert.throws(() => timeoutSchema.parse(59999), /at least 60000/);
  });

  test('Value above 300000 (300001) is rejected', () => {
    assert.throws(() => timeoutSchema.parse(300001), /cannot exceed 300000/);
  });

  test('Decimal value (120000.5) is rejected', () => {
    assert.throws(() => timeoutSchema.parse(120000.5), /must be an integer/);
  });

  test('Zero is rejected', () => {
    assert.throws(() => timeoutSchema.parse(0), /at least 60000/);
  });

  test('Negative value (-60000) is rejected', () => {
    assert.throws(() => timeoutSchema.parse(-60000), /at least 60000/);
  });

  test('Invalid non-numeric string "abc" is rejected', () => {
    assert.throws(() => timeoutSchema.parse('abc'), /Expected number/);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runEnvTimeoutTests();
