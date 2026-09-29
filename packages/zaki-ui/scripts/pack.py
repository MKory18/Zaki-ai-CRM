# -*- coding: utf-8 -*-
"""
ONE COMMAND, ONE ZIP — `pnpm zaki-ui:pack`.

The studio's machine copies the result into
`web/static/vendor/zaki-ui/` and works offline from there.

`zipfile` is the standard library, so this needs nothing installed: the
brief asks for a pack step that depends on nothing outside the repository,
and the other generator in this package is already Python.

It rebuilds `dist/` first on purpose. A zip made from a stale folder is the
worst artefact here — it looks right, it installs, and it ships the version
before the fix.
"""
import io
import os
import subprocess
import sys
import zipfile

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(PKG, 'dist')

version = io.open(os.path.join(PKG, 'VERSION'), encoding='utf-8').read().strip()

node = subprocess.run(['node', os.path.join(PKG, 'scripts', 'build-dist.mjs')],
                      capture_output=True, text=True, encoding='utf-8', errors='replace')
if node.returncode != 0:
    sys.stderr.write(node.stdout + node.stderr)
    raise SystemExit('dist build failed — nothing packed')

out = os.path.join(DIST, 'zaki-ui-%s.zip' % version)
if os.path.exists(out):
    os.remove(out)

count = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _dirs, names in os.walk(DIST):
        for n in sorted(names):
            path = os.path.join(base, n)
            if os.path.abspath(path) == os.path.abspath(out):
                continue
            arc = os.path.relpath(path, DIST).replace(os.sep, '/')
            z.write(path, 'zaki-ui/' + arc)
            count += 1

size = os.path.getsize(out)
print('%s — %d files, %.0f KB' % (os.path.relpath(out, PKG).replace(os.sep, '/'), count, size / 1024))
