// Tipos del dominio. Toda pieza del pipeline consume estas estructuras.
// El Storyboard es la "fuente de verdad" de un video: lo produce el agente
// de guion y lo leen las etapas de voz, visión y composición.

/** Dirección de arte: la "biblia visual" del video. Se define una vez por caso. */
export interface ArtDirection {
  medium: string;        // p.ej. "ilustración estilo novela gráfica oscura"
  lineWork: string;      // tratamiento del trazo
  palette: string;       // paleta de color
  lighting: string;      // iluminación
  texture: string;       // textura / grano
  mood: string;          // atmósfera emocional
  composition: string;   // encuadre / composición
  humanTreatment: string;// cómo se representa a las personas (sin gore, etc.)
  constraints: string;   // restricciones duras (sin texto en imagen, etc.)
}

/** Una escena del video. Un caso típico tiene ~10. */
export interface Scene {
  id: string;            // "scene-01"
  block: string;         // etiqueta narrativa ("GANCHO", "DESARROLLO"...)
  start: number;         // segundo de inicio
  end: number;           // segundo de fin
  voiceover: string;     // narración (ES) que dirá la voz
  onScreenText: string[];// textos que aparecen en pantalla
  imagePrompt: string;   // descripción de la imagen de la escena (EN)
  motion: string;        // nota de animación (zoom, paneo, etc.)
}

/** El guion estructurado completo de un video. */
export interface Storyboard {
  channel: string;
  caseNumber: number;
  title: string;
  totalDuration: number; // duración objetivo en segundos
  artDirection: ArtDirection;
  scenes: Scene[];
}
