// Configuración central: rutas absolutas y acceso a la API del cluster NaN.
// Todos los modelos del cluster se acceden por la misma API OpenAI-compatible,
// con el mismo base URL. Aquí se centraliza esa configuración.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// raíz del proyecto = dos niveles arriba de src/config/
const ROOT = resolve(__dirname, '..', '..');

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return v;
}

export const config = {
  // Rutas absolutas (evita que los scripts escriban en el lugar equivocado).
  paths: {
    root: ROOT,
    audio: resolve(ROOT, 'assets', 'audio'),
    images: resolve(ROOT, 'assets', 'images'),
    output: resolve(ROOT, 'assets', 'output'),
    content: resolve(ROOT, 'src', 'content'),
  },

  // Cluster NaN: una sola API OpenAI-compatible para todos los modelos.
  nan: {
    baseUrl: () => required('NAN_BASE_URL'),   // base URL del cluster
    apiKey: () => required('NAN_API_KEY'),     // token del miembro
  },

  // Nombres de modelo del cluster (ajustar si cambian en la plataforma).
  models: {
    text: 'qwen3.6',              // guion / chat / tool calling
    textHeavy: 'deepseek-v4-flash',// alternativa para razonamiento largo
    vision: 'mimo-v2.5',          // entiende imágenes (NO las genera)
    tts: 'kokoro',                // texto a voz
    stt: 'whisper',               // voz a texto (subtítulos)
    embedding: 'qwen3-embedding', // embeddings vectoriales (RAG)
  },

  // Voz por defecto para kokoro (es = español).
  voice: {
    id: () => process.env.NAN_VOICE_ID ?? 'em_alex', // em_alex (m) / ef_dora (f)
  },
} as const;
