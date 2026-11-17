import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (path: string) => readFileSync(path, 'utf8');
it('restricts the entire configured capability union to the editor and registered management commands', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  expect(config.app.windows).toEqual([]);
  expect(config.app.withGlobalTauri).toBe(false);
  expect(config.app.security.capabilities).toEqual(['editor']);
  const capabilities = readdirSync('src-tauri/capabilities');
  expect(capabilities).toEqual(['editor.json']);
  const cap = JSON.parse(read('src-tauri/capabilities/editor.json'));
  expect(cap.windows).toEqual(['editor']);
  expect(cap.webviews).toEqual(['editor']);
  expect(cap.remote).toBeUndefined();
  expect(cap.local).toBe(true);
  expect(cap.permissions.sort()).toEqual([
    'allow-host-probe',
    'allow-start-preview',
    'allow-stop-preview',
  ]);
  expect(read('src-tauri/build.rs')).toContain('AppManifest::new().commands(');
  expect(read('src-tauri/Cargo.toml')).not.toMatch(
    /tauri-plugin-(fs|shell|http|opener)/,
  );
});
it('retains a sandboxed srcdoc boundary and parent navigation restriction in the native shell', () => {
  const html = read('public/native-preview.html');
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).not.toContain('allow-same-origin');
  expect(html).toContain("frame-src 'none'");
  expect(read('src-tauri/src/main.rs')).toContain('.incognito(child)');
});
