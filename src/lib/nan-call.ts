// Wrapper sobre llamadas a la API NaN con:
// - Semáforo GLOBAL de concurrencia (máx 3 simultáneas — límite duro del
//   cluster NaN, no negociable; compartido por TODO el proceso)
// - Throttle global (60 rpm)
// - Retry exponencial por llamada (máx 3 reintentos)
//
// El estado vive a nivel de módulo: da igual cuántos createNanCall se creen
// (02-vision crea uno por candidata), todos comparten la misma cola. OJO: el
// límite de 3 es del cluster entero — no lances varios procesos del pipeline
// en paralelo (los casos se corren UNO A UNO); un semáforo en memoria no
// puede coordinar procesos distintos.
//
// Uso:
//   const call = createNanCall(() => nan.chat.completions.create({ ... }));
//   const result = await call();
//
// Errores en formato: ERROR / WHY / FIX

interface NanCallOptions {
  maxRetries?: number;
}

interface QueuedCall<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  retries: number;
  maxRetries: number;
}

// Límite duro del cluster NaN: máximo 3 peticiones en paralelo.
const MAX_CONCURRENT = 3;
const MAX_RPM = 60;

// Estado GLOBAL del proceso (módulo ESM = singleton).
const queue: QueuedCall<unknown>[] = [];
let active = 0;
const rpmTimestamps: number[] = [];
let draining = false;

function canProceed(): boolean {
  const now = Date.now();
  while (rpmTimestamps.length > 0 && rpmTimestamps[0] < now - 60_000) {
    rpmTimestamps.shift();
  }
  return rpmTimestamps.length < MAX_RPM;
}

function drain(): void {
  if (draining) return;
  draining = true;

  while (queue.length > 0 && active < MAX_CONCURRENT && canProceed()) {
    const item = queue.shift()!;
    active++;
    rpmTimestamps.push(Date.now());
    void execute(item);
  }

  draining = false;
}

async function execute(item: QueuedCall<unknown>): Promise<void> {
  try {
    const result = await item.fn();
    active--;
    item.resolve(result);
    drain();
  } catch (err) {
    // Libera el slot ANTES de esperar el backoff: una llamada en retry no
    // debe bloquear a las demás (el semáforo es del cluster, no de la espera).
    active--;
    if (item.retries < item.maxRetries) {
      const delay = Math.pow(2, item.retries) * 1000;
      item.retries++;
      setTimeout(() => {
        queue.unshift(item);
        drain();
      }, delay);
    } else {
      item.reject(err);
    }
    drain();
  }
}

export function createNanCall<T>(
  fn: () => Promise<T>,
  options: NanCallOptions = {},
): () => Promise<T> {
  const { maxRetries = 3 } = options;

  return function call(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0,
        maxRetries,
      });
      drain();
    });
  };
}
