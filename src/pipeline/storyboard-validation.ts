// PASO 1 (lógica pura) · Utilidades de la generación de guion: extraer el JSON
// de la respuesta del modelo y validar la forma del Storyboard.
// Cero dependencias del cluster: testeable en aislamiento (vitest).

export const REQUIRED_SCENES = 10;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateOptions {
  /**
   * Si se indica, exige exactamente ese número de escenas — la regla de
   * GENERACIÓN (yarn script valida contra el recuento pedido, 10 por
   * defecto). El cargador no lo pasa: un caso curado o golden puede tener
   * cualquier número ≥ 1 (caso-ejemplo tiene 9).
   */
  sceneCount?: number;
}

const ART_DIRECTION_FIELDS = [
  'medium',
  'lineWork',
  'palette',
  'lighting',
  'texture',
  'mood',
  'composition',
  'humanTreatment',
  'constraints',
] as const;

const SCENE_STRING_FIELDS = ['id', 'block', 'voiceover', 'imagePrompt', 'motion'] as const;

/**
 * Extrae el objeto JSON de la respuesta cruda de un modelo de texto.
 * Tolera: bloques de razonamiento `<think>…</think>` (qwen3.6 con el modo
 * de razonamiento activo), vallas de código markdown y prosa alrededor.
 * Si no hay objeto, devuelve el texto recortado (el JSON.parse posterior
 * fallará y disparará el retry).
 */
export function extractJson(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/```json|```/gi, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validación estructural de un Storyboard recién parseado: campos requeridos,
 * exactamente REQUIRED_SCENES escenas y tiempos coherentes por escena.
 * Los errores nombran el campo (`scenes[3].voiceover`) para poder devolvérselos
 * al modelo como feedback de corrección.
 */
export function validateStoryboard(
  data: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const { sceneCount } = options;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['la raíz debe ser un objeto JSON'] };
  }
  const errors: string[] = [];
  const sb = data as Record<string, unknown>;

  if (!isNonEmptyString(sb.channel)) errors.push('channel: falta o está vacío');
  if (typeof sb.caseNumber !== 'number') errors.push('caseNumber: debe ser un número');
  if (!isNonEmptyString(sb.title)) errors.push('title: falta o está vacío');
  if (typeof sb.totalDuration !== 'number' || sb.totalDuration <= 0) {
    errors.push('totalDuration: debe ser un número positivo (segundos)');
  }

  const ad = sb.artDirection;
  if (typeof ad !== 'object' || ad === null || Array.isArray(ad)) {
    errors.push('artDirection: falta o no es un objeto');
  } else {
    for (const field of ART_DIRECTION_FIELDS) {
      if (!isNonEmptyString((ad as Record<string, unknown>)[field])) {
        errors.push(`artDirection.${field}: falta o está vacío`);
      }
    }
  }

  const scenes = sb.scenes;
  if (!Array.isArray(scenes)) {
    errors.push('scenes: falta o no es un array');
  } else {
    if (sceneCount !== undefined && scenes.length !== sceneCount) {
      errors.push(
        `scenes: se esperaban exactamente ${sceneCount} escenas y llegaron ${scenes.length}`,
      );
    } else if (scenes.length === 0) {
      errors.push('scenes: no puede estar vacío');
    }
    scenes.forEach((scene, i) => {
      if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
        errors.push(`scenes[${i}]: no es un objeto`);
        return;
      }
      const s = scene as Record<string, unknown>;
      for (const field of SCENE_STRING_FIELDS) {
        if (!isNonEmptyString(s[field])) {
          errors.push(`scenes[${i}].${field}: falta o está vacío`);
        }
      }
      if (!Array.isArray(s.onScreenText) || s.onScreenText.some((t) => typeof t !== 'string')) {
        errors.push(`scenes[${i}].onScreenText: debe ser un array de strings`);
      }
      if (typeof s.start !== 'number' || typeof s.end !== 'number' || !(s.end > s.start)) {
        errors.push(`scenes[${i}]: start y end deben ser números con end > start`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
