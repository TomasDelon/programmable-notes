import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const host = 'scripts/native-inline-react-v1/host/src/main.rs';
const backend = 'src-tauri/vendor/wry/src/webkitgtk/mod.rs';
const callbackPattern =
  /\.with_on_page_load_handler\(move \|event, _url\| match event \{[\s\S]*?\n {8}\}\)/;

function assertEarlyObservation(source) {
  const callback = callbackPattern.exec(source);
  assert.ok(
    callback,
    'Native load observation must be configured on the builder',
  );
  const html = source.indexOf('.with_html(FIXTURE)');
  const build = source.indexOf('.build_gtk(&plug)');
  assert.ok(callback.index < html && html < build);
  assert.match(
    callback[0],
    /PageLoadEvent::Started => native_page\(Some\(NativeEvent::Committed\)\)/,
  );
  assert.match(
    callback[0],
    /PageLoadEvent::Finished => native_page\(Some\(NativeEvent::Finished\)\)/,
  );
  assert.doesNotMatch(
    callback[0],
    /println!|eprintln!|format!|load_html|\.eval\(/,
  );
  assert.doesNotMatch(source, /\.connect_load_changed\(|\.load_html\(/);
  assert.ok(source.indexOf('.connect_load_failed') > build);
  assert.ok(source.indexOf('.connect_web_process_terminated') > build);
}

function assertPinnedBackendOrder(source) {
  const attach = source.indexOf(
    'Self::attach_handlers(&webview, web_context, &mut attributes)',
  );
  const load = source.indexOf('w.webview.load_html(&html, None)');
  assert.ok(attach >= 0 && attach < load);
  const pageHandler = source.slice(
    source.indexOf('if let Some(on_page_load_handler)'),
    source.indexOf('// window creation handler'),
  );
  assert.match(
    pageHandler,
    /LoadEvent::Committed => \{\s*on_page_load_handler\(PageLoadEvent::Started,/,
  );
  assert.match(
    pageHandler,
    /LoadEvent::Finished => \{\s*on_page_load_handler\(PageLoadEvent::Finished,/,
  );
}

test('fixed native host observes commit/finish before its unchanged initial HTML load', async () => {
  assertEarlyObservation(await readFile(host, 'utf8'));
});

test('pinned GTK backend attaches builder callbacks before load and maps Started to commit', async () => {
  const source = await readFile(backend, 'utf8');
  assertPinnedBackendOrder(source);
  assert.throws(() =>
    assertPinnedBackendOrder(
      source.replace(
        'Self::attach_handlers(&webview, web_context, &mut attributes);',
        '',
      ) + '\nSelf::attach_handlers(&webview, web_context, &mut attributes);',
    ),
  );
  assert.throws(() =>
    assertPinnedBackendOrder(
      source.replace(
        'on_page_load_handler(PageLoadEvent::Started,',
        'on_page_load_handler(PageLoadEvent::Finished,',
      ),
    ),
  );
});

test('observation control rejects a late handler, wrong phase mapping and replacement navigation', async () => {
  const source = await readFile(host, 'utf8');
  assertEarlyObservation(source);
  const callback = callbackPattern.exec(source)[0];
  const late = source.replace(callback, '') + '\n' + callback;
  assert.throws(() => assertEarlyObservation(late));
  assert.throws(() =>
    assertEarlyObservation(
      source.replace(
        'PageLoadEvent::Started => native_page(Some(NativeEvent::Committed))',
        'PageLoadEvent::Started => native_page(Some(NativeEvent::Finished))',
      ),
    ),
  );
  assert.throws(() =>
    assertEarlyObservation(
      source.replace('.with_html(FIXTURE)', '') + '\n_view.load_html(FIXTURE);',
    ),
  );
});
