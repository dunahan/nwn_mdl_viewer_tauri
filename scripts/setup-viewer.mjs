#!/usr/bin/env node
/**
 * Klont bzw. aktualisiert das nwn_mdl_webviewer-Repo nach `viewer/`.
 *
 * Bewusst KEIN Git-Submodule (siehe TAURI_INTEGRATION_NOTES.md — `.gitignore`
 * schließt `/viewer` bereits explizit aus). Läuft automatisch nach
 * `npm install` (siehe package.json > scripts.postinstall) und ist manuell
 * über `npm run setup` erneut aufrufbar (z. B. um auf den neuesten
 * Webviewer-Stand zu aktualisieren).
 *
 * Override der Quelle über Umgebungsvariablen möglich (z. B. für Forks
 * oder Feature-Branches während der Entwicklung):
 *   VIEWER_REPO_URL=https://github.com/<fork>/nwn_mdl_webviewer.git
 *   VIEWER_REPO_REF=my-branch
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VIEWER_DIR = path.join(REPO_ROOT, 'viewer');

const REPO_URL = process.env.VIEWER_REPO_URL || 'https://github.com/dunahan/nwn_mdl_webviewer.git';
const REPO_REF = process.env.VIEWER_REPO_REF || 'main';

function run(cmd, args, cwd) {
  console.log(`[setup-viewer] $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

try {
  if (fs.existsSync(path.join(VIEWER_DIR, '.git'))) {
    console.log(`[setup-viewer] viewer/ existiert bereits — aktualisiere (fetch + reset --hard)`);
    run('git', ['fetch', 'origin', REPO_REF], VIEWER_DIR);
    run('git', ['checkout', REPO_REF], VIEWER_DIR);
    run('git', ['reset', '--hard', `origin/${REPO_REF}`], VIEWER_DIR);
  } else {
    if (fs.existsSync(VIEWER_DIR)) {
      console.error(`[setup-viewer] FEHLER: ${VIEWER_DIR} existiert, ist aber kein Git-Repo.`);
      console.error(`[setup-viewer] Bitte manuell entfernen oder prüfen, dann erneut ausführen.`);
      process.exit(1);
    }
    console.log(`[setup-viewer] Klone ${REPO_URL} (${REPO_REF}) nach viewer/`);
    // ponytail: --depth 1, da viewer/ als Vendor-Snapshot genutzt wird — der
    // volle Commit-Verlauf wird von build-viewer.mjs/dev-server.mjs nie
    // gelesen. Spart Netzwerk + .git-Größe bei jedem Setup-Lauf (u. a. 3x
    // pro Release-Workflow-Matrix). Der Update-Zweig oben (fetch REPO_REF +
    // reset --hard) funktioniert unverändert mit einem Shallow-Clone.
    run('git', ['clone', '--depth', '1', '--branch', REPO_REF, '--single-branch', REPO_URL, VIEWER_DIR], REPO_ROOT);
  }
  console.log('[setup-viewer] Fertig. viewer/ ist bereit.');
} catch (err) {
  console.error('[setup-viewer] Fehlgeschlagen:', err.message);
  console.error('[setup-viewer] Läuft dieser Rechner offline? viewer/ muss dann manuell bereitgestellt werden.');
  process.exit(1);
}
