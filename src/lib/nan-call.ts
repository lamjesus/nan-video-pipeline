// Wrapper sobre llamadas a la API NaN con:
// - Semáforo GLOBAL de concurrencia (máx 3 simultáneas — límite duro del
//   cluster NaN, no negociable; compartido por TODO el proceso)
// - Throttle por bucket de endpoint (chat 60 rpm; kokoro 15 rpm; whisper 10 rpm)
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
//   // Endpoints con límite propio: bucket aparte.
//   const tts = createNanCall(fn, { bucket: 'tts', rpm: 15 });
//
// Errores en formato: ERROR / WHY / FIX

interface NanCallOptions {
  maxRetries?: number;
  /** Bucket de rpm: endpoints con límite propio no comparten ventana. */
  bucket?: string;
  /** Límite de rpm del bucket (default 60, el del chat). */
  rpm?: number;
}

interface QueuedCall<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  retries: number;
  maxRetries: number;
  bucket: string;
  rpm: number;
}

// Límite duro del cluster NaN: máximo 3 peticiones en paralelo (global).
const MAX_CONCURRENT = 3;
const DEFAULT_BUCKET = 'chat';
const DEFAULT_RPM = 60;

// Estado GLOBAL del proceso (módulo ESM = singleton).
const queue: QueuedCall<unknown>[] = [];
let active = 0;
const bucketTimestamps = new Map<string, number[]>();
let draining = false;
let rpmTimer: ReturnType<typeof setTimeout> | null = null;

function canProceed(bucket: string, rpm: number): boolean {
  const now = Date.now();
  const ts = bucketTimestamps.get(bucket) ?? [];
  while (ts.length > 0 && ts[0] < now - 60_000) {
    ts.shift();
  }
  bucketTimestamps.set(bucket, ts);
  return ts.length < rpm;
}

function drain(): void {
  if (draining) return;
  draining = true;

  while (active < MAX_CONCURRENT) {
    // El primero de la cola cuyo bucket tenga rpm libre: un bucket saturado
    // (p.ej. tts a 15 rpm) no bloquea las llamadas de los demás.
    const idx = queue.findIndex((it) => canProceed(it.bucket, it.rpm));
    if (idx === -1) break;
    const item = queue.splice(idx, 1)[0];
    active++;
    bucketTimestamps.get(item.bucket)!.push(Date.now());
    void execute(item);
  }

  draining = false;
  scheduleRpmDrain();
}

// Si quedan llamadas en cola bloqueadas SOLO por rpm, nadie volvería a llamar
// a drain() hasta el siguiente evento — se reprograma para cuando caduque el
// timestamp más antiguo del bucket bloqueado.
function scheduleRpmDrain(): void {
  if (rpmTimer || queue.length === 0 || active >= MAX_CONCURRENT) return;

  const now = Date.now();
  let wakeIn = Infinity;
  for (const it of queue) {
    const ts = bucketTimestamps.get(it.bucket);
    if (ts && ts.length >= it.rpm && ts.length > 0) {
      wakeIn = Math.min(wakeIn, ts[0] + 60_000 - now);
    }
  }
  if (!Number.isFinite(wakeIn)) return;

  rpmTimer = setTimeout(() => {
    rpmTimer = null;
    drain();
  }, Math.max(wakeIn, 1));
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
  const { maxRetries = 3, bucket = DEFAULT_BUCKET, rpm = DEFAULT_RPM } = options;

  return function call(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0,
        maxRetries,
        bucket,
        rpm,
      });
      drain();
    });
  };
}

/** Solo para tests: limpia el estado global del módulo. */
export function _resetNanCallState(): void {
  queue.length = 0;
  active = 0;
  bucketTimestamps.clear();
  if (rpmTimer) {
    clearTimeout(rpmTimer);
    rpmTimer = null;
  }
}
