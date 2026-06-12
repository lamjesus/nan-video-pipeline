import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNanCall } from '../../src/lib/nan-call.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('createNanCall — semáforo GLOBAL (límite duro del cluster: 3 en paralelo)', () => {
  it('never exceeds 3 in-flight calls, even across different call sites', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: Array<() => void> = [];
    const makeFn = () => () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<string>((resolve) => {
        gates.push(() => {
          inFlight--;
          resolve('ok');
        });
      });
    };

    // 6 llamadas desde 6 createNanCall distintos (como hace 02-vision por candidata)
    const calls = Array.from({ length: 6 }, () => createNanCall(makeFn())());

    let done = false;
    void Promise.all(calls).then(() => {
      done = true;
    });
    while (!done) {
      while (gates.length > 0) gates.shift()!();
      await new Promise((r) => setTimeout(r, 1));
    }

    expect(maxInFlight).toBe(3);
    await expect(Promise.all(calls)).resolves.toHaveLength(6);
  });

  it('retries with exponential backoff and eventually resolves', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const call = createNanCall(() => {
      attempts++;
      return attempts < 3 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
    });

    const p = call();
    await vi.advanceTimersByTimeAsync(1000); // retry 1 (2^0 s)
    await vi.advanceTimersByTimeAsync(2000); // retry 2 (2^1 s)

    await expect(p).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('rejects after exhausting retries', async () => {
    vi.useFakeTimers();
    const call = createNanCall(() => Promise.reject(new Error('always')), { maxRetries: 1 });
    const p = call();
    const assertion = expect(p).rejects.toThrow('always');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('releases the slot while a call waits for its retry (no head-of-line blocking)', async () => {
    vi.useFakeTimers();
    let failing = 0;
    const failer = createNanCall(() => {
      failing++;
      return Promise.reject(new Error('busy'));
    }, { maxRetries: 1 });

    const ran: string[] = [];
    const quick = createNanCall(() => {
      ran.push('quick');
      return Promise.resolve('ok');
    });

    const pFail = failer();
    const assertion = expect(pFail).rejects.toThrow('busy');
    const pQuick = quick();

    // El failer está esperando su backoff de 1s: quick NO debe quedar bloqueado.
    await vi.advanceTimersByTimeAsync(10);
    expect(ran).toContain('quick');

    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    await expect(pQuick).resolves.toBe('ok');
  });
});
