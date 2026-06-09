// Cliente compartido del cluster NaN. Como la API es OpenAI-compatible,
// se usa el SDK de OpenAI apuntando al base URL del cluster.
// Reutilizar este cliente evita repetir configuración en cada pipeline.
import OpenAI from 'openai';
import { config } from '../config/index.js';

export const nan = new OpenAI({
  baseURL: config.nan.baseUrl(),
  apiKey: config.nan.apiKey(),
});

// Nota: kokoro (TTS) y whisper (STT) pueden requerir endpoints específicos
// (p.ej. /audio/speech y /audio/transcriptions). Revisar la doc del cluster
// y, si hace falta, usar nan.audio.speech.create / nan.audio.transcriptions.create
// o un fetch directo al endpoint correspondiente.
