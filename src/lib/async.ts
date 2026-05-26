export const DEFAULT_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  code: string;

  constructor(code = 'TIMEOUT_ERROR', message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
    this.code = code;
  }
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  code = 'TIMEOUT_ERROR'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(code)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
