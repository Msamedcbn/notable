import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './async';

describe('withTimeout', () => {
  it('returns result when promise resolves in time', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'TEST_TIMEOUT');
    expect(result).toBe('ok');
  });

  it('throws TimeoutError when promise exceeds limit', async () => {
    await expect(
      withTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50)),
        1,
        'TEST_TIMEOUT'
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

