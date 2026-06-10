// Wrapper sobre llamadas a la API NaN con:
// - Retry exponencial (máx 3 reintentos)
// - Semáforo de concurrencia (máx 3 simultáneas)
// - Throttle (60 rpm)
//
// Uso:
//   const call = createNanCall(() => nan.chat.completions.create({ ... }));
//   const result = await call();
//
// Errores en formato: ERROR / WHY / FIX

interface NanCallOptions {
  maxRetries?: number;
  maxConcurrent?: number;
  maxRpm?: number;
}

interface QueuedCall<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  retries: number;
}

export function createNanCall<T>(
  fn: () => Promise<T>,
  options: NanCallOptions = {},
): () => Promise<T> {
  const {
    maxRetries = 3,
    maxConcurrent = 3,
    maxRpm = 60,
  } = options;

  const queue: QueuedCall<T>[] = [];
  let active = 0;
  const rpmTimestamps: number[] = [];
  let draining = false;

  function canProceed(): boolean {
    const now = Date.now();
    while (rpmTimestamps.length > 0 && rpmTimestamps[0] < now - 60_000) {
      rpmTimestamps.shift();
    }
    return rpmTimestamps.length < maxRpm;
  }

  function drain(): void {
    if (draining) return;
    draining = true;

    while (queue.length > 0 && active < maxConcurrent && canProceed()) {
      const item = queue.shift()!;
      active++;
      rpmTimestamps.push(Date.now());
      execute(item);
    }

    draining = false;
  }

  async function execute(item: QueuedCall<T>): Promise<void> {
    try {
      const result = await item.fn();
      active--;
      item.resolve(result);
      drain();
    } catch (err) {
      if (item.retries < maxRetries) {
        const delay = Math.pow(2, item.retries) * 1000;
        item.retries++;
        setTimeout(() => {
          execute(item);
        }, delay);
      } else {
        active--;
        item.reject(err);
        drain();
      }
    }
  }

  return function call(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject, retries: 0 });
      drain();
    });
  };
}