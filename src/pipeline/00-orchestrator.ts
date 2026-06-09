// PASO 0 · Orquestador. Ejecuta el pipeline completo de principio a fin.
// Uso: yarn produce "La erupción del Vesubio"
//
// ESTADO: stub que encadena las etapas. Cada etapa se invoca como subproceso
// para mantenerlas desacopladas. Ajustar a medida que las piezas se completen.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const tema = process.argv[2];

if (!tema) {
  console.error('Uso: yarn produce "<tema del video>"');
  process.exit(1);
}

async function step(label: string, args: string[]) {
  console.log(`\n=== ${label} ===`);
  const { stdout, stderr } = await exec('npx', ['tsx', ...args]);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function main() {
  // 1. Guion
  await step('1/4 · Guion', ['src/pipeline/01-script.ts', tema]);
  // A partir de aquí el caso generado debe estar registrado en load.ts.
  const slug = 'caso-generado';

  // 2. Selección visual
  await step('2/4 · Visión', ['src/pipeline/02-vision.ts', slug]);
  // 3. Voz
  await step('3/4 · Voz', ['src/pipeline/03-voice.ts', slug]);
  // 4. Render (HyperFrames) — se monta sobre render-<slug>/
  console.log('\n=== 4/4 · Render ===');
  console.log('Monta render-<slug>/ con el index.html y los assets, luego:');
  console.log('  cd render-<slug> && npx hyperframes render . --output ../assets/output/<slug>.mp4');

  console.log('\nPipeline terminado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
