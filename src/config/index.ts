// Configuración central: rutas absolutas y acceso a la API del cluster NaN.
// Todos los modelos del cluster se acceden por la misma API OpenAI-compatible,
// con el mismo base URL. Aquí se centraliza esa configuración.
//
// Los valores ajustables (modelos, voz, providers) viven en `config.yml` en la
// raíz; este módulo los carga. Los secretos siguen en el entorno (.env).
//
// `dotenv/config` carga el .env al importar: cualquier script que use `config`
// ve las variables sin pasos extra. (Si no existe .env, dotenv no falla.)
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
// raíz del proyecto = dos niveles arriba de src/config/
const ROOT = resolve(__dirname, '..', '..');

function required(name: string): string {
  // dotenv/config ya volcó el .env en process.env (ver import arriba).
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return v;
}

// --- Carga de config.yml (modelos, voz, providers) ---
// Es obligatorio: sin él no sabemos a qué modelos del cluster llamar.
interface FileConfig {
  models: {
    text: string;
    textHeavy: string;
    visionEval: string;
    visionEvalFallback: string;
    tts: string;
    stt: string;
    embedding: string;
  };
  voice: { default: string };
  media: { providers: string[] };
}

function loadFileConfig(): FileConfig {
  const path = resolve(ROOT, 'config.yml');
  try {
    return parse(readFileSync(path, 'utf-8')) as FileConfig;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `No se pudo leer config.yml en ${path}. Es obligatorio ` +
        `(modelos, voz, providers). Detalle: ${msg}`,
    );
  }
}

const file = loadFileConfig();

export const config = {
  // Rutas absolutas (evita que los scripts escriban en el lugar equivocado).
  paths: {
    root: ROOT,
    audio: resolve(ROOT, 'assets', 'audio'),
    images: resolve(ROOT, 'assets', 'images'),
    output: resolve(ROOT, 'assets', 'output'),
    content: resolve(ROOT, 'src', 'content'),
    // Casos (storyboards) como DATOS en YAML — editables sin tocar código.
    cases: resolve(ROOT, 'content'),
    // Imágenes por caso: los scene-id se repiten entre casos; un directorio
    // plano hace que un caso pise al otro. Única fuente de esta convención
    // (la usan visión al guardar y compose al descubrir).
    imagesFor: (slug: string) => resolve(ROOT, 'assets', 'images', slug),
  },

  // Cluster NaN: una sola API OpenAI-compatible para todos los modelos.
  nan: {
    baseUrl: () => required('NAN_BASE_URL'),   // base URL del cluster
    apiKey: () => required('NAN_API_KEY'),     // token del miembro
  },

  // Nombres de modelo del cluster (vienen de config.yml; ajustar allí).
  models: file.models,

  // Voz por defecto para kokoro (override puntual con NAN_VOICE_ID).
  voice: {
    id: () => process.env.NAN_VOICE_ID ?? file.voice.default,
  },

  // Proveedores de media por defecto (override puntual con MEDIA_PROVIDERS).
  media: {
    providers: file.media.providers,
  },
} as const;
