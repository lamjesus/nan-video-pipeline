// Smoke-test de cada modelo del cluster NaN.
// Uso: npm run models:check
//
// Llama a cada modelo con una petición mínima y reporta OK/FAIL.
// Para kokoro (TTS): guarda una muestra en assets/audio/_voice-sample.mp3.
//
// Formato de errores: ERROR / WHY / FIX.

import { writeFile, mkdir } from 'node:fs/promises';
import { nan } from '../src/lib/nan-client.js';
import { config } from '../src/config/index.js';

interface ModelResult {
  model: string;
  ok: boolean;
  detail?: string;
}

const results: ModelResult[] = [];

function record(result: ModelResult): void {
  results.push(result);
  const icon = result.ok ? '✅' : '❌';
  console.log(`${icon} ${result.model}${result.detail ? ` — ${result.detail}` : ''}`);
}

// --- text: qwen3.6 ---
async function checkText(): Promise<void> {
  try {
    const res = await nan.chat.completions.create({
      model: config.models.text,
      messages: [{ role: 'user', content: 'Responde solo con "ok" en una palabra.' }],
      max_tokens: 10,
    });
    const text = res.choices[0]?.message?.content ?? '';
    record({ model: config.models.text, ok: true, detail: `ok → "${text.trim()}"` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model: config.models.text, ok: false, detail: msg });
  }
}

// --- vision: mimo-v2.5 ---
// ⚠️ El cluster NaN NO acepta content como array (formato OpenAI estándar).
// El proxy litellm da "Param Incorrect" con image_url.
// Solución: pasar la imagen como markdown inline en content string.
// Ver PROGRESS.md > Hallazgos críticos > mimo-v2.5 para detalles.
async function checkVision(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();

  try {
    const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Vesuvius_1826.jpg/256px-Vesuvius_1826.jpg';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.models.vision,
        messages: [
          {
            role: 'user',
            content: `![image](${imageUrl}) Describe esta imagen brevemente en una frase.`,
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      record({ model: config.models.vision, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    record({ model: config.models.vision, ok: true, detail: `ok → "${text.trim().slice(0, 60)}..."` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model: config.models.vision, ok: false, detail: msg });
  }
}

// --- tts: kokoro ---
// kokoro usa POST /v1/audio/speech → devuelve binario (mp3/wav/flac).
async function checkTTS(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();

  try {
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.models.tts,
        input: 'Esta es una prueba de voz en español. Hola, bienvenidos al canal.',
        voice: config.voice.id(),
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      record({ model: config.models.tts, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const audioDir = config.paths.audio;
    await mkdir(audioDir, { recursive: true });
    const path = `${audioDir}/_voice-sample.mp3`;
    await writeFile(path, buffer);

    record({ model: config.models.tts, ok: true, detail: `ok → ${path} (${buffer.length} bytes)` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model: config.models.tts, ok: false, detail: msg });
  }
}

// --- stt: whisper ---
// whisper usa POST /v1/audio/transcriptions con multipart/form-data.
// ⚠️ Node.js 24: fetch con FormData NO añade automáticamente Content-Type con boundary.
// La API NaN lo acepta sin Content-Type (lo infiere del multipart).
// Si falla, verificar que el sample de kokoro existe y tiene contenido.
async function checkSTT(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();

  try {
    // Usamos el audio sample generado por kokoro como input para whisper.
    const samplePath = `${config.paths.audio}/_voice-sample.mp3`;
    const fs = await import('node:fs');

    if (!fs.existsSync(samplePath)) {
      record({ model: config.models.stt, ok: false, detail: 'Sin _voice-sample.mp3 (ejecuta kokoro primero)' });
      return;
    }

    const audioBuffer = fs.readFileSync(samplePath);
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), '_voice-sample.mp3');
    form.append('model', config.models.stt);
    form.append('language', 'es');
    form.append('response_format', 'json');

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // NO poner Content-Type — fetch con FormData lo necesita con boundary,
        // y Node.js no lo añade automáticamente. La API NaN lo infiere.
      },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      record({ model: config.models.stt, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await res.json();
    const text = data.text ?? '';
    record({ model: config.models.stt, ok: true, detail: `ok → "${text.trim().slice(0, 60)}..."` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model: config.models.stt, ok: false, detail: msg });
  }
}

// --- embedding: qwen3-embedding ---
// qwen3-embedding usa POST /v1/embeddings (estándar OpenAI).
async function checkEmbedding(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.models.embedding,
        input: 'Esta es una frase de prueba para el embedding.',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      record({ model: config.models.embedding, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await res.json();
    const hasData = data.data && Array.isArray(data.data) && data.data.length > 0;
    const dim = hasData ? data.data[0].embedding?.length ?? 0 : 0;
    record({
      model: config.models.embedding,
      ok: hasData,
      detail: hasData ? `ok → dimensión ${dim}` : 'ok → respuesta vacía',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model: config.models.embedding, ok: false, detail: msg });
  }
}

// --- Main ---
async function main(): Promise<void> {
  console.log('🔍 NaN Video Pipeline — Model Smoke Check\n');

  await checkText();
  await checkVision();
  await checkTTS();
  await checkSTT();
  await checkEmbedding();

  console.log('');
  const failures = results.filter((r) => !r.ok);

  if (failures.length > 0) {
    console.log(`⚠️  ${failures.length} modelo(s) con problemas:`);
    for (const f of failures) {
      console.log(`   ❌ ${f.model}: ${f.detail}`);
    }
    console.log('\n   Estos modelos no son críticos para la demo básica.');
    console.log('   Los modelos core (qwen3.6, mimo-v2.5, kokoro) deben estar OK.');
  } else {
    console.log('✅ Todos los modelos respondieron correctamente.');
  }
}

main().catch((err) => {
  console.error('ERROR: models:check crash');
  console.error('WHY:', err.message);
  console.error('FIX: ejecuta de nuevo; si persiste, verifica la API del cluster NaN.');
  process.exit(1);
});
