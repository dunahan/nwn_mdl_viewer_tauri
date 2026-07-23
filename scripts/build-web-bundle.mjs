#!/usr/bin/env node
/**
 * Ruft `viewer/build.py` auf, um den STANDALONE-WEB-Bundle (viewer/dist/)
 * für GitHub Pages / manuelles Hosting zu erzeugen — bündelt CSS/JS inline
 * in eine index.html (inkl. Base64-WASM) und kopiert lang/ + wasm/ +
 * vendor/ nach dist/.
 *
 * WICHTIG: Das ist NICHT Teil der Tauri-Build-Pipeline mehr (siehe
 * scripts/build-viewer.mjs und TAURI_INTEGRATION_NOTES.md, Phase 4) —
 * `frontendDist` zeigt seit Phase 4 direkt auf das rohe `viewer/`, ohne
 * Build-Schritt. Dieses Skript ist nur noch relevant, falls jemand aus
 * diesem Repo heraus zusätzlich den unabhängigen Browser-Bundle für
 * GitHub Pages erzeugen möchte (`npm run build:web`).
 *
 * Bekannte Abhängigkeit: benötigt eine lokale Python-3-Installation
 * (nur für diesen optionalen Web-Bundle-Pfad, NICHT für `npm run tauri
 * build`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VIEWER_DIR = path.join(REPO_ROOT, 'viewer');

if (!fs.existsSync(path.join(VIEWER_DIR, 'build.py'))) {
  console.error('[build-web-bundle] viewer/build.py nicht gefunden.');
  console.error('[build-web-bundle] Bitte zuerst "npm run setup" ausführen.');
  process.exit(1);
}

function tryPython(bin) {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pythonBin = tryPython('python3') ? 'python3' : (tryPython('python') ? 'python' : null);
if (!pythonBin) {
  console.error('[build-web-bundle] Weder "python3" noch "python" gefunden. Bitte Python 3 installieren.');
  process.exit(1);
}

let version = '';
try {
  version = execFileSync(
    'git', ['describe', '--tags', '--always'],
    { cwd: VIEWER_DIR }
  ).toString().trim();
} catch {
  // No Git repository or tags reachable — then version remains empty,
  // build.py falls back to the default (no version string).
}

console.log(`[build-web-bundle] $ ${pythonBin} build.py --version ${version}  (cwd: viewer/)`);
try {
  execFileSync(pythonBin, ['build.py', '--version', version], { cwd: VIEWER_DIR, stdio: 'inherit' });
  console.log('[build-web-bundle] Fertig — viewer/dist/ ist bereit für Hosting (z. B. GitHub Pages).');
} catch (err) {
  console.error('[build-web-bundle] build.py fehlgeschlagen:', err.message);
  process.exit(1);
}
