# Tauri-Integration — Entwicklungsnotizen

## ⚠️ Patches immer mit `git am --keep-cr` anwenden, nicht `git am` allein

**Gefunden 2026-07-03, beim Verifizieren von Patch 0003 (Webviewer-Repo).**
`nwn_mdl_webviewer/index.html` nutzt CRLF-Zeilenenden (der Rest des Repos
— alle `js/*.js` — nutzt LF). `git am` verarbeitet Patches intern über
`git mailinfo` (Mail-Envelope-Parsing), das dabei standardmäßig `\r`
(CR) aus Patch-Zeilen entfernt — das ist eine reine
Mail-Kompatibilitäts-Normalisierung, keine böswillige Beschädigung.
Ergebnis: der Kontext im Patch matcht danach nicht mehr byte-genau
gegen die tatsächliche CRLF-Datei im Repo → `error: patch does not
apply`, obwohl der Patch-Inhalt selbst zu 100 % korrekt ist (verifiziert
über `git apply --check`, das ohne Mail-Parsing arbeitet und sofort grün
war).

**Fix:** `git am --keep-cr <patch>` statt `git am <patch>` — verhindert
genau dieses CR-Stripping. Getestet: funktioniert identisch für reine
LF-Patches (Tauri-App-Repo) UND für CRLF-betroffene Patches (Webviewer-
Repo) — als einheitlicher Befehl für beide Repos unbedenklich, kein
repo-spezifisches Sonderwissen nötig.

**Für mich (Claude) als Prozess-Learning:** Meine bisherige
Verifikationsmethodik (`git am` auf einem frischen Klon testen) hätte
diesen Fehler NICHT gefunden, wenn ich nicht zufällig genau den Patch
getestet hätte, der zum ersten Mal eine CRLF-Datei anfasst (Patches 1+2
rühren `index.html` nicht an, nur reine LF-`.js`-Dateien — deshalb dort
unauffällig). Ab sofort: bei JEDEM neuen Patch, der eine `.html`-Datei
oder andere potenziell CRLF-behaftete Datei berührt, gezielt mit
`git am --keep-cr` (nicht nur `git apply --check`) auf einem frischen
Klon gegentesten, bevor er als verifiziert gilt.

---

Dieses Dokument protokolliert Entscheidungen, verifizierte Fakten und bekannte
Stolperfallen bei der Umwandlung von `nwn_mdl_webviewer` (reines Browser-JS)
in `nwn_mdl_viewer_tauri`. Ziel: Keine Entscheidung zweimal treffen, keinen
bereits gefundenen Fehler wiederholen.

Format je Eintrag: **Datum · Phase · Entscheidung/Fakt · Begründung/Quelle**

---

## Phase 1 — Repo-Wiring (dieser Patch)

### 2026-07-01 · Kein Git-Submodule für `viewer/`
`.gitignore` im Tauri-Repo enthielt bereits `/viewer` — das spricht dagegen,
den Ordner überhaupt von Git tracken zu lassen (auch nicht als Submodule-
Gitlink). Stattdessen: `npm run setup` (bzw. automatisch via `postinstall`)
klont/aktualisiert `nwn_mdl_webviewer` lokal nach `viewer/`. Vorteil ggü.
Submodule: keine "detached HEAD"-Fallen, kein `--recurse-submodules` nötig,
funktioniert identisch für Solo-Dev-Workflow wie CI.
→ Falls sich das als unpraktisch erweist (z. B. weil Versionierung des
  Viewer-Standes explizit im Tauri-Repo sichtbar sein soll), ist die
  Alternative ein Git-Submodule (`git submodule add`) — dann muss `/viewer`
  aus `.gitignore` entfernt werden.

### 2026-07-01 · `frontendDist` zeigt auf `../viewer/dist` (Produktions-Build), `devUrl` auf rohe Quelle
- **Dev-Loop:** `viewer/` wird unverändert über einen simplen statischen
  Server ausgeliefert (`npm run dev` → `scripts/dev-server.mjs`, Port 8080).
  Kein Bundler nötig, da der Viewer reine `<script>`-Tags ohne Build-Schritt
  nutzt. Damit sind Live-Änderungen an `viewer/js/*.js` sofort sichtbar
  (Browser-Reload reicht, kein Rebuild).
- **Production-Build:** `npm run build` ruft `viewer/build.py` auf (bereits
  vorhandenes, funktionierendes Skript im Webviewer-Repo — erzeugt
  `viewer/dist/index.html` mit inline CSS/JS + Base64-WASM, plus
  `viewer/dist/lang/` und `viewer/dist/wasm/`). **Getestet und lauffähig**
  (siehe Terminal-Log unten). `tauri.conf.json > build.frontendDist` zeigt
  auf `../viewer/dist`.
- **Bekannte Abhängigkeit:** `build.py` benötigt `python3` auf dem Build-
  Rechner/in der CI. Das ist ein zusätzlicher Toolchain-Bestandteil neben
  Node+Rust. TODO (Phase 3, optional): `build.py`-Logik nach Node portieren,
  um die App komplett auf Node+Rust zu reduzieren. Nicht in diesem Patch,
  um den Scope klein zu halten — `build.py` funktioniert und ist getestet.

### 2026-07-01 · `app.withGlobalTauri: true` gesetzt
Verifiziert über offizielles Tauri-v2-Schema (`schema.tauri.app/config/2`) —
korrekter Ort ist `app.withGlobalTauri` (NICHT `build.withGlobalTauri` wie
in Tauri v1). Notwendig, weil der Viewer keinen Bundler/ES-Module-Import
verwendet (`hot_reload.js` referenziert direkt `window.__TAURI__.dialog`
etc.). Ohne dieses Flag stünde `window.__TAURI__` im Frontend nicht zur
Verfügung.

### 2026-07-01 · Nebenbei: Default-Fenstergröße 800×600 → 1280×800
Kleine, unabhängige UX-Änderung: 800×600 ist für einen 3D-Modell-Viewer mit
Sidebar sehr eng. Falls unerwünscht, einfach in `tauri.conf.json >
app.windows[0]` zurücksetzen — rein kosmetisch, keine funktionale
Abhängigkeit zu den übrigen Änderungen in diesem Patch.

### 2026-07-01 · CSP bleibt vorerst `null`
Nicht in diesem Patch verschärft — Fokus liegt auf Funktionsfähigkeit.
TODO (Phase 3, Security-Hardening): CSP restriktiv setzen, sobald CDN-
Abhängigkeiten (Three.js von cdnjs.cloudflare.com, Google Fonts) entweder
lokal gevendort oder explizit in `connect-src`/`script-src`/`font-src`
freigegeben sind. Bis dahin ist `csp: null` im Desktop-Kontext (kein
Remote-Content, nur lokale Dateien) ein akzeptables Risiko, aber kein
Endzustand.

### 2026-07-01 · KRITISCHER Fund: Tauri v2 `fs`-Scope erweitert sich NICHT automatisch für Dialog-Ordnerauswahl
Anders als die Browser File System Access API (`showDirectoryPicker`, aktuell
in `hot_reload.js` genutzt) gewährt Tauris `dialog`-Plugin **keinen**
automatischen `fs`-Scope-Zugriff auf den vom Nutzer gewählten Pfad. Das
Standard-`fs:default`-Permission-Set deckt nur App-eigene Verzeichnisse ab
(AppConfig/AppData/AppLocalData/AppCache/AppLog) — NICHT beliebige
Nutzerordner wie den Textur-Watch-Ordner.
**Lösung (verifiziert, offizielles Tauri-Docs-Beispiel):** Ein eigener
`#[tauri::command]` auf Rust-Seite, der nach der Dialog-Auswahl explizit
`app_handle.fs_scope().allow_directory(&path, true)` aufruft
(`tauri_plugin_fs::FsExt`-Trait). Erst danach dürfen `@tauri-apps/plugin-fs`-
Aufrufe (`readDir`, `readFile`, `watch`, …) auf diesen Pfad zugreifen.
→ Umgesetzt als Command `grant_folder_access` in `src-tauri/src/lib.rs`.
→ **Phase 2 TODO:** `hot_reload.js`-Tauri-Backend-Zweig muss nach
  `dialog.open({directory:true})` IMMER zuerst `invoke('grant_folder_access',
  {path})` aufrufen, bevor `fs.readDir`/`fs.watch` genutzt wird. Sonst
  Silent-Fail bzw. Promise-Rejection mit "not allowed"-Fehler.

### 2026-07-01 · Permission-Identifier für `fs:allow-watch` NICHT verifiziert
Alle anderen genutzten `fs:allow-*`-Identifier sind über die offizielle
"autogenerated permissions"-Referenz bestätigt (read, read_dir, read_text_file,
exists, mkdir, stat/fstat/lstat, …). Der genaue Identifier für die `watch`/
`watchImmediate`-Funktion von `@tauri-apps/plugin-fs` konnte ich nicht mit
100%iger Sicherheit aus der Doku bestätigen (Namensmuster legt `fs:allow-watch`
nahe, ist aber nicht wortwörtlich belegt).
→ **Phase 2 TODO:** Beim ersten lokalen `tauri dev` mit aktiviertem Watch-
  Code die Konsole beobachten — Tauri gibt bei fehlender Permission IMMER
  den exakt benötigten Identifier im Fehlertext aus (siehe Beispiel unten),
  dann `capabilities/default.json` entsprechend nachziehen:
  ```
  [Error] Unhandled Promise Rejection: fs.watch not allowed.
  Permissions associated with this command: fs:allow-watch, ...
  ```
  Bereits vorsorglich in `capabilities/default.json` mit Kommentar markiert.

### 2026-07-01 · Kein Cargo/Rust in dieser Sandbox verfügbar
`cargo`/`rustc` sind in der Ausführungsumgebung, in der dieser Patch erstellt
wurde, nicht installiert (nur Node 22 + Python 3.12 + Git). Die Rust-Dateien
in diesem Patch sind **syntaktisch/logisch geprüft, aber nicht kompiliert**.
→ Bitte lokal `cargo check` in `src-tauri/` ausführen, bevor der Patch
  gemerged wird. Etwaige Versionskonflikte bei `tauri-plugin-fs`/
  `tauri-plugin-dialog` (Cargo-Version `"2"` = neueste 2.x) ggf. anpassen.

### 2026-07-01 · npm-Pakete `@tauri-apps/plugin-{fs,dialog}` in package.json, aber Nutzung ungeklärt
`viewer/` hat keinen Bundler und nutzt bislang nur `window.__TAURI__.*`
(globaler Zugriff, kein `import`). Mit `app.withGlobalTauri: true` injiziert
Tauri die **Core-API** garantiert auf `window.__TAURI__`. Ob das für
**Plugin-APIs** (`fs`, `dialog`) automatisch mitgilt, sobald die
Rust-Plugins registriert sind, konnte ich nicht zweifelsfrei belegen.
→ **Phase 2 TODO:** Beim ersten Testlauf prüfen, ob `window.__TAURI__.fs`
  und `window.__TAURI__.dialog` ohne Weiteres vorhanden sind. Falls nicht:
  entweder ein kleines `<script type="module">`-Snippet in `index.html`
  ergänzen, das `@tauri-apps/plugin-fs`/`-dialog` importiert und explizit
  auf `window.__TAURI__.fs`/`.dialog` zuweist (Bridge), oder die
  offiziellen JS-Bindings der Plugins direkt einbetten. Die npm-Pakete
  sind bereits als Dependency vorbereitet, falls dieser Weg nötig wird.

### 2026-07-01 · Kein Schreibzugriff auf GitHub-Repos aus dieser Sandbox
Nur Lesezugriff via `git clone`/`git ls-remote`. Alle Änderungen werden
deshalb als `.patch`-Datei (Format: `git format-patch`, anwendbar via
`git am`) bereitgestellt statt direkt gepusht.

---

## Offene Punkte für Phase 2 (Frontend-Integration in `nwn_mdl_webviewer`)

Diese Änderungen gehören in das **Webviewer-Repo** (nicht dieses Tauri-Repo),
da `hot_reload.js` dort liegt:

1. `js/hot_reload.js` → `_backend === 'tauri'`-Zweig in `_backendPick()`
   implementieren:
   - `@tauri-apps/plugin-dialog` → `open({ directory: true })`
   - Ergebnis-Pfad an `invoke('grant_folder_access', { path })` übergeben
     (Command aus diesem Patch, Phase 1 bereits vorbereitet)
   - `@tauri-apps/plugin-fs` → `readDir(path, { recursive: true })` für den
     initialen Scan (ersetzt `_scanDir()`s `dirHandle.entries()`-Iteration)
   - `watch()`/`watchImmediate()` statt `setInterval`-Polling (`POLL_MS`)
     für Änderungserkennung — echtes Dateisystem-Watching statt Pollen,
     spart Akku/CPU ggü. Browser-Fallback.
2. `_detectBackend()` in `hot_reload.js` erkennt Tauri bereits korrekt über
   `window.__TAURI__` (kein Änderungsbedarf, war schon vorbereitet).
3. Analog für `showDirectoryPicker`-Ersatz bei `HotReload.setModelFileHandle`
   (Set Browser / MDL-Drag&Drop-Handle) prüfen — aktuell nutzt
   `loader.js` `item.getAsFileSystemHandle()`, das existiert unter Tauri
   nicht. Muss auf `@tauri-apps/plugin-dialog`s `open()`-Ergebnis (liefert
   Pfad statt `FileSystemFileHandle`) umgestellt werden — **eigener
   Untersuchungspunkt, noch nicht im Detail geplant.**
4. Drei.js + Google Fonts von CDN → für Offline-Fähigkeit lokal vendoren
   (aktuell nur als TODO notiert, nicht blockierend für ersten Testlauf,
   da Desktop-App i.d.R. mit Internetzugang läuft).

---

## Phase 3 — Natives Drag&Drop für MDL-Laden (Folgepatch)

### 2026-07-02 · `dragDropEnabled` explizit auf `true` gesetzt (war/ist Default)
Kritischer, in der Community mehrfach dokumentierter Stolperstein (siehe
u. a. tauri-apps/tauri#14373): Ist `dragDropEnabled` `true` (Default),
feuern die HTML5-DOM-`drop`/`dragover`-Events **überhaupt nicht** — Tauri
fängt den Drop auf WebView-Ebene ab, bevor er das DOM erreicht. Das
bestehende `viewport.addEventListener('drop', …)` in `loader.js` (Browser-
Pfad) lief unter Tauri also schlicht ins Leere. Lösung: natives
`getCurrentWebviewWindow().onDragDropEvent(...)` statt DOM-Events — siehe
Patch fürs Webviewer-Repo. Explizit in `tauri.conf.json` gesetzt (statt nur
auf dem Default zu vertrauen), samt Kommentar hier, damit niemand das
Flag versehentlich umdreht, um ein unrelated HTML5-DnD-Problem zu fixen
(genau das war der Auslöser mehrerer verlinkter GitHub-Issues).

### 2026-07-02 · Neuer Command `grant_files_access` für einzeln gedroppte Dateien
`grant_folder_access` (Phase 1) deckt nur EINEN Ordner rekursiv ab — ein
per Drag&Drop abgelegtes MDL kann aber aus einem beliebigen, vorher nie
freigegebenen Verzeichnis stammen (auch mehrere Dateien aus
unterschiedlichen Ordnern in einem Drop). Neuer Command gewährt Scope pro
einzelnem Pfad (`allow_file`), nicht rekursiv für den Elternordner — Least
Privilege. Bewusst nachsichtig implementiert (kein `?`-Abbruch bei
einzelnen ungültigen Pfaden), damit ein stale Pfad in einem Multi-File-
Drop nicht das Laden der übrigen, gültigen Dateien verhindert.

### 2026-07-02 · `allow_file` auf der Scope-API angenommen, nicht 1:1 in offizieller Doku-Seite gefunden
Existenz und Signatur (`scope.allow_file(&PathBuf) -> Result<...>`)
stammen aus einem Community-"Skill"-Dokument mit Rust-Codebeispiel, nicht
aus der offiziellen Tauri-Referenzseite selbst (die war für `allow_file`
nicht eindeutig auffindbar). Analog zu `allow_directory` aufgebaut, hohe
Plausibilität, aber: **`cargo check` lokal ist hier Pflicht**, bevor
gemerged wird — falls die Methode anders heißt, zeigt der Compiler-Fehler
sofort den korrekten Namen (Autovervollständigung/IDE hilft ebenso).

### 2026-07-02 · Keine neuen `capabilities/default.json`-Einträge nötig (angenommen)
Custom-App-Commands (`#[tauri::command]`, via `invoke_handler!`
registriert) sind in Tauri v2 nach allem, was ich finden konnte, NICHT
über das capability/ACL-System gegated — das betrifft nur Plugin-Commands.
Ein funktionierendes Minimalbeispiel für `onDragDropEvent` kam mit nur
`core:default` + `opener:default` aus, ohne dediziertes Event/Window-
Permission für Drag&Drop. → Falls `grant_files_access` oder
`onDragDropEvent` lokal dennoch mit einem Permission-Fehler abbricht: exakte
Fehlermeldung liefert den fehlenden Identifier (wie schon bei
`fs:allow-watch` beschrieben).

### 2026-07-02 · Globaler Namespace für `getCurrentWebviewWindow` nicht 100 % verifiziert
Angenommen: `window.__TAURI__.webviewWindow.getCurrentWebviewWindow()`
(passend zum Import-Pfad `@tauri-apps/api/webviewWindow` und dem bereits
bestätigten Muster `.core`, `.fs`, `.dialog`). Frontend-Code (siehe
Webviewer-Repo, `loader.js`) probiert defensiv zusätzlich
`window.__TAURI__.webview.getCurrentWebview()` als Fallback, da beide
APIs laut Doku-Recherche `.onDragDropEvent(...)` besitzen.

## Phase 4 — CSP-Härtung + CDN-Vendoring

### 2026-07-03 · KURSKORREKTUR: `frontendDist` wieder auf rohes `../viewer` statt `../viewer/dist`
**Widerruft die Phase-1-Entscheidung**, `viewer/build.py`s gebündelten
Output zu verwenden. Grund: `build.py` inlined alle projekteigenen
JS-Module als `<script>...</script>`-Blöcke direkt in eine einzige
`dist/index.html` (sinnvoll für die Web-/GitHub-Pages-Distribution, wo
Single-File-Portabilität zählt). Eine strikte CSP mit `script-src 'self'`
(ohne `'unsafe-inline'`) hätte diese Inline-Skripte komplett blockiert —
und `'unsafe-inline'` für Scripts zuzulassen, nur um das zu umgehen, hätte
den gesamten Sinn der CSP-Härtung untergraben (Inline-Script-Injection ist
genau der Angriffsvektor, den CSP eigentlich verhindern soll).

Die rohe `viewer/`-Quelle nutzt dagegen ausschließlich externe `<script
src="js/...">`-Tags (verifiziert: keine einzige Inline-`<script>`
im Quellcode) — das macht `script-src 'self' 'wasm-unsafe-eval'` (kein
`'unsafe-inline'`) überhaupt erst möglich.

**Bewertung, warum das für Tauri unproblematisch ist:** Der einzige Zweck
von `build.py`s Single-File-Bündelung war, den Viewer per `file://` ohne
Server lauffähig zu machen (Browser blockieren `fetch()` unter `file://`,
daher das Base64-WASM-Embedding) bzw. als portable Datei verteilbar zu
machen. Tauri bündelt `frontendDist` ohnehin als eigenständigen
Asset-Ordner in die App — der Grund für die Bündelung entfällt komplett.
**Netter Nebeneffekt:** `npm run tauri build` braucht dadurch gar kein
Python 3 mehr (siehe Scripts unten) — nur noch Node + Rust.

`build.py`/`viewer/dist/` bleiben vollständig erhalten und funktionsfähig
— nur nicht mehr Teil der Tauri-Pipeline. Weiterhin nutzbar für die
unabhängige Web-Distribution über `npm run build:web`.

### 2026-07-03 · Scripts angepasst: `build-viewer.mjs` (Verifikation) vs. `build-web-bundle.mjs` (Python/build.py)
- `scripts/build-viewer.mjs` (neu, schlank): prüft nur noch, dass
  `viewer/` vollständig vorhanden ist (`beforeBuildCommand`-Hook) — baut
  nichts mehr.
- `scripts/build-web-bundle.mjs` (umbenannt von `build-viewer.mjs`):
  unveränderte Python/`build.py`-Logik, jetzt über `npm run build:web`
  erreichbar, für alle, die zusätzlich den Web-Bundle erzeugen wollen.

### 2026-07-03 · CSP-Direktiven — gegen offizielle Tauri-Doku verifiziert, nicht geraten
```json
"csp": {
  "default-src": "'self'",
  "script-src": "'self' 'wasm-unsafe-eval'",
  "style-src": "'self' 'unsafe-inline'",
  "font-src": "'self'",
  "img-src": "'self' blob:",
  "connect-src": "'self' ipc: http://ipc.localhost",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'"
}
```
Begründung je Direktive, aus tatsächlicher Code-Analyse (nicht
Bauchgefühl):
- **`script-src 'wasm-unsafe-eval'`**: zwingend für
  `WebAssembly.compile()`/`instantiate()` im WASM-Decompiler
  (`cleanmodels.js`). Bewusst NICHT das breitere `'unsafe-eval'` — der
  dedizierte WASM-Keyword ist genau für diesen Fall gedacht und
  deutlich enger gefasst. Kein `'unsafe-inline'` nötig, siehe
  `frontendDist`-Kurskorrektur oben.
- **`style-src 'unsafe-inline'`**: **nötig**, nicht optional. Codesuche in
  `nwn_mdl_webviewer` fand echte `style="..."`-HTML-Attribute in
  generiertem `innerHTML` (`js/ui.js`, `js/session.js` — u. a. die
  Farb-Swatches für Emitter-/Licht-Eigenschaften im Node-Detail-Panel,
  mit dynamischen Farbwerten, die sich nicht vorab hashen lassen). CSS
  via `element.style.xxx = …` (JS/CSSOM, nicht HTML-Attribut) ist von
  `style-src` NICHT betroffen — nur das HTML-`style="..."`-Attribut
  selbst. `'unsafe-inline'` für Styles gilt allgemein als deutlich
  risikoärmer als für Scripts (Style-Injection-XSS ist ein viel
  engerer Angriffsvektor) — pragmatischer, gängiger Kompromiss.
  **Mögliche spätere Härtung (nicht in diesem Patch):** die
  betroffenen `innerHTML`-Stellen auf `.style.xxx = …`-Zuweisungen
  umbauen, dann `'unsafe-inline'` entfernen.
- **`img-src blob:`**: `loader.js` lädt PNG/JPG-Texturen über
  `URL.createObjectURL(file)` + `THREE.TextureLoader` (intern ein
  `Image()`-Element mit `blob:`-URL als `src`).
- **`connect-src ipc: http://ipc.localhost`**: zwingend für
  `window.__TAURI__.core.invoke(...)` (all unsere Custom-Commands:
  `grant_folder_access`, `grant_files_access`) — Tauris IPC-Mechanismus
  läuft intern über dieses Protokoll/diesen Origin.
- **`object-src`/`base-uri`/`form-action: 'none'`**: Standard-Härtung,
  verifiziert dass die App weder `<object>`/`<embed>` noch `<base>` noch
  `<form>` nutzt (Codesuche negativ) — kein Funktionsverlust.
- Kein `worker-src` nötig: keine `Worker`/`SharedArrayBuffer`-Nutzung
  gefunden. Kein `data:` in `img-src`: keine `toDataURL()`-Nutzung
  gefunden (Canvas-Texturen laufen über `CanvasTexture`, nicht über
  Data-URIs).

### 2026-07-03 · CDN-Vendoring (Details im Webviewer-Repo)
Three.js + Google Fonts sind jetzt in `nwn_mdl_webviewer` unter `vendor/`
selbst gehostet (npm als Quelle, Three.js SHA-512-verifiziert
byte-identisch zum vorherigen CDN-Build). Voraussetzung dafür, dass obige
CSP überhaupt aufgehen kann — ohne Vendoring hätte `script-src`/`font-src`
weiterhin `cdnjs.cloudflare.com`/`fonts.googleapis.com`/`fonts.gstatic.com`
enthalten müssen. Details, Versionen, Lizenzen:
`nwn_mdl_webviewer/vendor/README.md` und `docs/TAURI_BACKEND_NOTES.md`
(Phase 4) im Webviewer-Repo.

### 2026-07-03 · Nicht abschließend verifizierte Annahmen (Phase 4)
Keine offenen Unsicherheiten bei den CSP-Direktiven selbst (alle gegen
offizielle Tauri-Dokumentationsbeispiele abgeglichen: `ipc:
http://ipc.localhost` und `'wasm-unsafe-eval'` stammen wortwörtlich aus
Tauris eigener CSP-Referenzdoku). Einziger offener Punkt: **ein echter
`cargo tauri build`-Lauf mit dieser CSP wurde mangels Rust-Toolchain in
dieser Sandbox nicht durchgeführt.** Falls die App mit aktiver CSP eine
Konsolen-Fehlermeldung wie „Refused to … because it violates the
following Content Security Policy directive" zeigt: die Meldung nennt
exakt die blockierte Direktive — gleiches Vorgehen wie bei den
`fs:allow-*`-Permission-Fehlern in Phase 1–3.

## Testprotokoll

| Datum | Aktion | Ergebnis |
|---|---|---|
| 2026-07-01 | `python3 viewer/build.py` (lokal in Sandbox) | ✅ Erfolgreich — `dist/index.html` (7432 KB), `dist/lang/`, `dist/wasm/` erzeugt |
| 2026-07-01 | `cargo check` in `src-tauri/` | ⛔ Nicht durchführbar (kein Rust-Toolchain in Sandbox) — **muss lokal nachgeholt werden** |
| 2026-07-01 | `npm run tauri dev` End-to-End | ⛔ Nicht durchführbar (kein Rust-Toolchain) — **muss lokal verifiziert werden** |
