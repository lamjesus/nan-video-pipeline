// Smoke-test de cada modelo del cluster NaN.
// Uso: yarn models:check
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

// --- vision: gemma4 (evaluación real con imagen en base64, formato array) ---
// mimo-v2.5 no se prueba: está ciego en el cluster (ver docs/TROUBLESHOOTING.md).
async function checkVision(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();
  const model = config.models.visionEval;

  // PNG 1x1 transparente: verifica que el modelo acepta imagen en base64.
  const dataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '¿Recibes la imagen? Responde OK.' },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      record({ model, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    record({ model, ok: true, detail: `ok → "${text.trim().slice(0, 60)}"` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model, ok: false, detail: msg });
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

// --- rerank: Qwen3-Reranker-8B (anunciado, aún NO desplegado a 2026-06-11) ---
// Sonda el formato Cohere/Jina en POST /v1/rerank. Mientras el gateway no
// exponga la ruta responde `404 page not found` (texto plano) — se reporta
// como "no desplegado", no como fallo inesperado. Ver docs/TROUBLESHOOTING.md.
async function checkRerank(): Promise<void> {
  const baseUrl = config.nan.baseUrl();
  const apiKey = config.nan.apiKey();
  const model = config.models.reranker;

  try {
    const res = await fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        query: 'Ancient Roman siege of a hilltop city',
        documents: ['Numantia', 'Tulip mania', 'Roman siege warfare'],
        top_n: 3,
      }),
    });

    const text = await res.text();
    if (res.status === 404) {
      record({
        model,
        ok: false,
        detail: 'aún NO desplegado (404 del gateway, esperado) — ver TROUBLESHOOTING.md',
      });
      return;
    }
    if (!res.ok) {
      record({ model, ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = JSON.parse(text) as { results?: { index: number; relevance_score: number }[] };
    const top = data.results?.[0];
    record({
      model,
      ok: Boolean(top),
      detail: top
        ? `ok → ¡DESPLEGADO! top: index ${top.index}, score ${top.relevance_score}`
        : `respuesta 200 sin results: ${text.slice(0, 200)}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ model, ok: false, detail: msg });
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
  await checkRerank();

  console.log('');
  const failures = results.filter((r) => !r.ok);

  if (failures.length > 0) {
    console.log(`⚠️  ${failures.length} modelo(s) con problemas:`);
    for (const f of failures) {
      console.log(`   ❌ ${f.model}: ${f.detail}`);
    }
    console.log('\n   Estos modelos no son críticos para la demo básica.');
    console.log('   Los modelos core (qwen3.6, gemma4, kokoro) deben estar OK.');
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
