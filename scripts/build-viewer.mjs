#!/usr/bin/env node
/**
 * beforeBuildCommand-Hook (siehe src-tauri/tauri.conf.json).
 *
 * Seit Phase 4 zeigt `frontendDist` direkt auf das rohe `viewer/` (keine
 * Bündelung mehr nötig — siehe TAURI_INTEGRATION_NOTES.md für die
 * Begründung: build.py's Inline-Bündelung war mit einer strikten CSP
 * unvereinbar, siehe security.csp in tauri.conf.json). Dieses Skript baut
 * deshalb NICHTS mehr — es verifiziert nur, dass `viewer/` vorhanden und
 * vollständig ist, damit `tauri build` bei einem fehlenden/unvollständigen
 * Ordner eine klare, sofortige Fehlermeldung bekommt statt eines
 * kryptischeren Fehlers tief in der Tauri-CLI-Bündelung.
 *
 * Für den separaten, unabhängigen Web-Bundle (GitHub Pages etc.) siehe
 * stattdessen `npm run build:web` (scripts/build-web-bundle.mjs) — das
 * ruft weiterhin viewer/build.py auf und benötigt Python 3. Das hier
 * NICHT: `npm run tauri build` kommt jetzt komplett ohne Python 3 aus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VIEWER_DIR = path.join(REPO_ROOT, 'viewer');

const REQUIRED = ['index.html', 'js', 'css', 'lang'];
const missing = REQUIRED.filter(p => !fs.existsSync(path.join(VIEWER_DIR, p)));

if (!fs.existsSync(VIEWER_DIR) || missing.length > 0) {
  console.error('[build-viewer] viewer/ fehlt oder ist unvollständig' +
    (missing.length ? ` (fehlend: ${missing.join(', ')})` : '') + '.');
  console.error('[build-viewer] Bitte "npm run setup" ausführen.');
  process.exit(1);
}

console.log('[build-viewer] viewer/ vorhanden und vollständig — nichts zu tun (frontendDist zeigt direkt darauf).');
