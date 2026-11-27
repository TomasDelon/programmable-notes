import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFile,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const host = resolve('scripts/native-inline-react-v1/host');
const read = (name) => readFile(join(host, name), 'utf8');
async function program() {
  const source = await read('build.rs');
  const match = /const COMPILE: &str = r#"([\s\S]*?)"#;/.exec(source);
  assert.ok(match, 'The actual fixed build program must be present.');
  return match[1];
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('host manifest stays on local reviewed libraries and an app-lock registry subset', async () => {
  const manifest = await read('Cargo.toml');
  assert.match(
    manifest,
    /wry = \{ path = "\.\.\/\.\.\/\.\.\/src-tauri\/vendor\/wry" \}/,
  );
  assert.match(
    manifest,
    /preview-policy = \{ path = "\.\.\/\.\.\/\.\.\/native-policy" \}/,
  );
  for (const name of ['gtk', 'gdkx11'])
    assert.ok(manifest.includes(`${name} = "=0.18.2"`));
  const records = (lock) =>
    lock
      .split('[[package]]')
      .slice(1)
      .flatMap((record) => {
        const source = /^source = "([^"]+)"/m.exec(record)?.[1];
        if (!source?.startsWith('registry+')) return [];
        return [
          JSON.stringify([
            /^name = "([^"]+)"/m.exec(record)[1],
            /^version = "([^"]+)"/m.exec(record)[1],
            source,
            /^checksum = "([^"]+)"/m.exec(record)[1],
          ]),
        ];
      });
  const app = new Set(records(await readFile('src-tauri/Cargo.lock', 'utf8')));
  const selected = records(await read('Cargo.lock'));
  assert.ok(selected.length > 0);
  assert.ok(
    selected.every((record) => app.has(record)),
    'No registry dependency upgrade is allowed.',
  );
});

test('actual build program produces only bounded public OUT_DIR artifacts without host execution', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'pn-inline-host-build-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const javascript = await program();
  const run = (...extra) =>
    spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', javascript, host, output, ...extra],
      { encoding: 'utf8', timeout: 30000 },
    );
  const invalid = run('--html=foreign');
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout + invalid.stderr, '');
  assert.deepEqual(await readdir(output), []);
  const wrongNode = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "Object.defineProperty(process, 'version', {value:'v0.0.0'});\n" +
        javascript,
      host,
      output,
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(wrongNode.status, 2);
  assert.equal(wrongNode.stdout + wrongNode.stderr, '');
  assert.deepEqual(await readdir(output), []);
  const result = run();
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(output)).sort(), [
    'fixture-evidence.bin',
    'fixture-manifest.json',
    'fixture.html',
  ]);
  const html = await readFile(join(output, 'fixture.html'));
  const manifest = JSON.parse(
    await readFile(join(output, 'fixture-manifest.json'), 'utf8'),
  );
  const manifestBytes = await readFile(join(output, 'fixture-manifest.json'));
  const evidence = await readFile(join(output, 'fixture-evidence.bin'));
  const prefix = Buffer.from('PN_INLINE_REACT_GUARDED_V2_BUILD\0');
  const suffix = Buffer.from('\0PN_INLINE_REACT_GUARDED_V2_BUILD_END\0');
  assert.deepEqual(evidence.subarray(0, prefix.length), prefix);
  assert.equal(evidence.readUInt32BE(prefix.length), manifestBytes.length);
  assert.deepEqual(
    evidence.subarray(prefix.length + 4, -suffix.length),
    manifestBytes,
  );
  assert.deepEqual(evidence.subarray(-suffix.length), suffix);
  assert.equal(evidence.indexOf(prefix, prefix.length), -1);
  assert.equal(evidence.indexOf(suffix), evidence.length - suffix.length);
  assert.equal(
    (await stat(join(output, 'fixture-evidence.bin'))).mode & 0o777,
    0o600,
  );
  assert.equal(manifest.nativeTested, false);
  assert.equal(manifest.generatedCodeEvaluatedOnHost, false);
  assert.equal(manifest.profile, 'inline-react-guarded-v2');
  assert.equal(manifest.artifacts.htmlSha256, digest(html));
  assert.equal(manifest.artifacts.htmlBytes, html.length);
  assert.ok(html.length <= 4 * 1024 * 1024);
  assert.equal((await stat(join(output, 'fixture.html'))).mode & 0o777, 0o600);
  assert.match(javascript, /process\.version/);
  assert.match(javascript, /\.nvmrc/);
  assert.match(javascript, /compileFixture\(\)/);
  assert.doesNotMatch(javascript, /eval\(|new Function|import\([^)]*html/);
  // A rebuild replaces only its artifact name, never follows an existing hardlink.
  const marker = join(output, 'marker');
  await writeFile(marker, 'keep');
  const { link, unlink } = await import('node:fs/promises');
  await unlink(join(output, 'fixture.html'));
  await link(marker, join(output, 'fixture.html'));
  assert.equal(run().status, 0);
  assert.equal(await readFile(marker, 'utf8'), 'keep');
});

test('runtime host has only fixed input, own-window diagnostics and trusted native lifecycle', async () => {
  const source = await read('src/main.rs');
  assert.match(
    source,
    /include_str!\(concat!\(env!\("OUT_DIR"\), "\/fixture\.html"\)\)/,
  );
  assert.match(source, /with_document_title_changed_handler/);
  assert.match(source, /title\.len\(\) <= 256/);
  assert.match(source, /native-before-webkit/);
  assert.match(source, /_PN_FIXTURE_STATE/);
  const beforeWebkit = source.slice(0, source.indexOf('let _view ='));
  assert.match(
    beforeWebkit,
    /let bridge_atom = gtk::gdk::Atom::intern\("_PN_FIXTURE_BRIDGE"\)/,
  );
  assert.match(beforeWebkit, /&receipt_window,\s*&bridge_atom,/);
  const titleCallback = source.slice(
    source.indexOf('.with_document_title_changed_handler'),
    source.indexOf('.build_gtk(&plug)'),
  );
  assert.match(titleCallback, /&receipt_atom,/);
  assert.doesNotMatch(
    titleCallback,
    /bridge_atom|_PN_FIXTURE_BRIDGE|activation|load_html|preview_browser_guards|gtk::main_quit/,
  );
  assert.match(source, /\.build_gtk\(&plug\)/);
  assert.match(source, /\.with_devtools\(false\)/);
  assert.match(source, /\.with_incognito\(true\)/);
  assert.match(source, /\.with_download_started_handler\(\|_, _\| false\)/);
  assert.match(source, /"about:blank"/);
  assert.match(source, /set_size_request\(300, 120\)/);
  assert.match(source, /Supervisor::default\(\)/);
  assert.match(source, /HOST_BUTTON_STOP/);
  assert.match(source, /HOST_ENTRY/);
  assert.match(source, /1001/);
  assert.match(
    source,
    /static BUILD_EVIDENCE: &\[u8\] = include_bytes!\(concat!\(env!\("OUT_DIR"\), "\/fixture-evidence\.bin"\)\);/,
  );
  assert.match(source, /std::hint::black_box\(BUILD_EVIDENCE\)/);
  assert.match(source, /println!\("HOST_SUPERVISOR_START"\)/);
  assert.match(
    source,
    /println!\("HOST_START_FAILURE \{\}", start_failure\(&error\)\)/,
  );
  const mapping = source.slice(
    source.indexOf('fn start_failure('),
    source.indexOf('fn host()'),
  );
  assert.match(mapping, /match error/);
  assert.match(mapping, /_ => "unknown"/);
  assert.doesNotMatch(mapping, /contains\(|starts_with\(|format!|println!/);
  const policy = await readFile('native-policy/src/lib.rs', 'utf8');
  const arms = [
    ...mapping.matchAll(/((?:"[^"\n]+"\s*\|?\s*)+) => "([a-z_]+)"/g),
  ];
  assert.deepEqual([...new Set(arms.map((arm) => arm[2]))].sort(), [
    'input_rejected',
    'invalid_limits',
    'network_not_isolated',
    'privileges_missing',
    'unit_not_active',
  ]);
  for (const arm of arms) {
    for (const literal of arm[1].matchAll(/"([^"\n]+)"/g))
      assert.ok(
        policy.includes(literal[0]),
        'Only exact current native-policy messages are classified.',
      );
  }
  assert.doesNotMatch(
    source,
    /\/repo|\/mnt|1000|with_ipc_handler|evaluate_script|grab_focus|native_documents|std::fs::write/,
  );
});

test('inline host cannot publish authored HTML during construction or before native guards and failure hooks', async () => {
  const source = await read('src/main.rs');
  assert.match(source, /mod preview_browser_guards;/);
  assert.match(source, /mod preview_activation;/);
  const build = source.indexOf('.build_gtk(&plug)?');
  const guards = source.indexOf('preview_browser_guards::install(&webkit)?');
  const failures = source.indexOf('webkit.connect_load_failed');
  const termination = source.indexOf('webkit.connect_web_process_terminated');
  const publish = source.indexOf('_view.load_html(FIXTURE)');
  assert.ok(
    build > 0 && guards > build && failures > build && termination > build,
  );
  assert.ok(publish > guards && publish > failures && publish > termination);
  assert.doesNotMatch(
    source.slice(0, build),
    /\.with_(?:html|url|initialization_script)\(/,
  );
  assert.match(
    source,
    /with_new_window_req_handler\(\|_, _\| NewWindowResponse::Deny\)/,
  );
  assert.match(
    source,
    /connect_download_started\(\|_, download\| download.cancel\(\)\)/,
  );
  assert.match(source, /activation.run\(/);
  assert.doesNotMatch(source, /__pnFixtureReport|with_ipc_handler/);
  const tauri = await readFile('src-tauri/src/preview_permissions.rs', 'utf8');
  assert.match(tauri, /preview_browser_guards::install\(&webview\)\?/);
  const shared = await readFile(
    'src-tauri/src/preview_browser_guards.rs',
    'utf8',
  );
  assert.match(shared, /request.cancel\(\)/);
  assert.match(shared, /request.deny\(\)/);
  assert.match(shared, /confirm_set_confirmed\(false\)/);
  assert.doesNotMatch(shared, /dialog.close\(|dialog.clone\(/);
});
