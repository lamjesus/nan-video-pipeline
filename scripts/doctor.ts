// Preflight doctor: verifica que el entorno está listo para el pipeline.
// Uso: yarn doctor
//
// Verifica:
//   1. Variables de entorno NAN_BASE_URL y NAN_API_KEY
//   2. ffmpeg y ffprobe en PATH
//   3. Conectividad a la API del cluster NaN
//
// Formato de errores: ERROR / WHY / FIX.
// Exit 1 si algún check falla.

import 'dotenv/config'; // carga .env antes de leer process.env
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
// package.json relativo al script, no al cwd: doctor funciona desde cualquier sitio.
const PKG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

const checks: CheckResult[] = [];

function record(result: CheckResult): void {
  checks.push(result);
  const icon = result.ok ? '✅' : '❌';
  console.log(`${icon} ${result.name}`);
  if (!result.ok && result.error) {
    console.log(`   ${result.error}`);
  }
}

// --- Check 1: Environment variables ---
function checkEnv(): void {
  const missing: string[] = [];

  if (!process.env.NAN_BASE_URL) {
    missing.push('NAN_BASE_URL');
  }
  if (!process.env.NAN_API_KEY) {
    missing.push('NAN_API_KEY');
  }

  if (missing.length > 0) {
    record({
      name: 'Environment variables',
      ok: false,
      error: `Faltan: ${missing.join(', ')}. Copia .env.example a .env y complétalo.`,
    });
  } else {
    record({ name: 'Environment variables', ok: true });
  }
}

// --- Check 2: vitest (test runner) ---
function checkVitest(): void {
  try {
    // Verificar que vitest está instalado (devDep)
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
    const hasVitest = pkg.devDependencies?.vitest || pkg.dependencies?.vitest;
    if (hasVitest) {
      record({ name: 'vitest (test runner)', ok: true });
    } else {
      record({
        name: 'vitest (test runner)',
        ok: false,
        error: 'vitest no está en package.json. Ejecuta: yarn add -D vitest',
      });
    }
  } catch (err) {
    record({
      name: 'vitest (test runner)',
      ok: false,
      error: `No se pudo leer ${PKG_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// --- Check 3: ffmpeg / ffprobe ---
async function checkFFmpeg(): Promise<void> {
  const tools = ['ffmpeg', 'ffprobe'];
  const missing: string[] = [];

  for (const tool of tools) {
    try {
      // ffmpeg usa -version (un guion), otros usan --version.
      const arg = tool === 'ffmpeg' || tool === 'ffprobe' ? ['-version'] : ['--version'];
      await exec(tool, arg);
    } catch {
      missing.push(tool);
    }
  }

  if (missing.length > 0) {
    record({
      name: 'ffmpeg / ffprobe',
      ok: false,
      error: `No encontrados: ${missing.join(', ')}. Instala con: brew install ffmpeg (macOS) o apt install ffmpeg (Linux).`,
    });
  } else {
    record({ name: 'ffmpeg / ffprobe', ok: true });
  }
}

// --- Check 3: NaN API connectivity ---
async function checkNaN(): Promise<void> {
  const baseUrl = process.env.NAN_BASE_URL;
  const apiKey = process.env.NAN_API_KEY;

  if (!baseUrl || !apiKey) {
    // Ya reportado por checkEnv; marcar como skip
    record({ name: 'NaN API connectivity', ok: true });
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.ok) {
      const data = await res.json();
      const models = data.data
        ? (data.data as { id: string }[]).map((m) => m.id).join(', ')
        : 'unknown';
      record({
        name: 'NaN API connectivity',
        ok: true,
      });
      console.log(`   Modelos disponibles: ${models}`);
    } else {
      const text = await res.text();
      record({
        name: 'NaN API connectivity',
        ok: false,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({
      name: 'NaN API connectivity',
      ok: false,
      error: `No se pudo conectar a ${baseUrl}: ${msg}`,
    });
  }
}

// --- Check 4: HyperFrames availability ---
async function checkHyperFrames(): Promise<void> {
  try {
    await exec('npx', ['hyperframes', '--version']);
    record({ name: 'hyperframes (renderer)', ok: true });
  } catch {
    record({
      name: 'hyperframes (renderer)',
      ok: false,
      error: 'No encontrado. Instala con: npm install -g hyperframes',
    });
  }
}

// --- Main ---
async function main(): Promise<void> {
  console.log('🔍 NaN Video Pipeline — Doctor\n');

  checkEnv();
  checkVitest();
  await checkFFmpeg();
  await checkHyperFrames();
  await checkNaN();

  console.log('');
  const failures = checks.filter((c) => !c.ok);

  if (failures.length > 0) {
    console.log(`❌ ${failures.length} check(s) fallaron. Arregla antes de continuar.`);
    process.exit(1);
  }

  console.log('✅ Todo listo. El entorno está configurado correctamente.');
}

main().catch((err) => {
  console.error('ERROR: doctor crash');
  console.error('WHY:', err.message);
  console.error('FIX: ejecuta de nuevo; si persiste, abre un issue.');
  process.exit(1);
});
