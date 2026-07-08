# nwn_mdl_viewer_tauri
This is the repository for the Tauri application of the NWN1 EE Model WebViewer (https://github.com/dunahan/nwn_mdl_webviewer).

## Getting Started

```bash
npm install          # installs deps + auto-clones the webviewer into viewer/ (postinstall)
npm run tauri dev    # starts the dev server (viewer/, raw source) + Tauri window
```

Production build:

```bash
npm run tauri build  # bundles viewer/ (raw source, no build step) into the app
```

To update the vendored viewer to the latest `main`:

```bash
npm run setup
```

To additionally produce the independent, single-file web bundle (for
GitHub Pages / manual hosting — unrelated to the Tauri app itself):

```bash
npm run build:web    # runs viewer/build.py -> viewer/dist/, requires Python 3
```

**Requirements:** Node.js, Rust + Cargo (Tauri toolchain). Python 3 is
**only** needed for the optional `npm run build:web` web-bundle path, not
for `npm run tauri dev`/`build`.

## Troubleshooting

### Linux: `libEGL warning: ... Keine Berechtigung` / `Permission denied` on `/dev/dri/*`

The app runs, but the terminal shows `libEGL`/DRI3 warnings and
`/dev/dri/renderD128` (or `/dev/dri/card*`) fails to open with a
permission error. WebKitGTK is falling back to software rendering —
the app still works, but since this is a WebGL-heavy 3D viewer
(Three.js), expect choppier rotation/zoom until this is fixed.

Cause: your Linux user account isn't in the group that owns the GPU
render device nodes (usually `render`, sometimes also `video`).

```bash
ls -la /dev/dri/        # check which group actually owns them on your system
groups $USER            # are you already a member?
sudo usermod -aG render,video $USER
```

**Log out and back in** (a fresh session is required — this doesn't
take effect in your current terminal) — then restart `npm run tauri
dev`. If you're running inside a VM, Docker/Podman container, or over
SSH/X11 forwarding, group membership alone may not be enough; you'll
also need GPU passthrough to the guest/container (e.g. Docker's
`--device /dev/dri`).

To confirm hardware acceleration is actually active, open the WebView's
devtools console and run:
```js
const gl = document.createElement('canvas').getContext('webgl');
gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
```
`llvmpipe`/`SWR` → still software rendering. Your actual GPU's name →
hardware acceleration is working.
