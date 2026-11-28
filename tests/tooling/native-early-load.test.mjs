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
  const build = source.indexOf('.build_gtk(&plug)?');
  assert.ok(build > callback.index);
  assert.equal(
    [...source.matchAll(/\.with_on_page_load_handler\(/g)].length,
    1,
  );
  assert.equal([...source.matchAll(/\.build_gtk\(/g)].length, 1);
  assert.doesNotMatch(source, /\.with_(?:html|url)\(/);
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
  assert.equal([...source.matchAll(/\.connect_load_changed\(/g)].length, 1);

  // This checks source wiring, not execution of native WebKit authority signals.
  // Both setup and publication must belong to the native one-shot admission.
  const activation =
    /activation\.run\(\s*true,\s*\|\| \{([\s\S]*?)\n {8}\},\s*\|\| \{([\s\S]*?)\n {8}\},\s*\)\?;/.exec(
      source,
    );
  assert.ok(activation, 'Native admission must own setup and publication');
  assert.ok(activation.index > build);
  const [, setup, publication] = activation;
  assert.match(setup, /preview_browser_guards::install\(&webkit\)\?;/);
  assert.match(setup, /webkit\.connect_load_failed\(/);
  assert.match(setup, /webkit\.connect_web_process_terminated\(/);
  const provisional =
    /webkit\.connect_load_changed\(move \|_, event\| \{([\s\S]*?)\n {12}\}\);/.exec(
      setup,
    );
  assert.ok(
    provisional,
    'Actual GTK provisional observation must precede publication',
  );
  assert.match(provisional[1], /if event == LoadEvent::Started/);
  assert.match(
    provisional[1],
    /native_provisional\(Some\(NativeEvent::ProvisionalStarted\)\)/,
  );
  assert.doesNotMatch(provisional[1], /load_html|\.eval\(|Committed|Finished/);
  const guardsInstalled = 'native_update(Some(NativeEvent::GuardsInstalled));';
  const installedAt = setup.indexOf(guardsInstalled);
  for (const pattern of [
    /preview_browser_guards::install\(&webkit\)\?;/,
    /context\.connect_download_started\(\|_, download\| download.cancel\(\)\);/,
    /webkit\.connect_load_failed\([\s\S]*?\n {12}\}\);/,
    /webkit\.connect_web_process_terminated\([\s\S]*?\n {12}\}\);/,
    /webkit\.connect_load_changed\([\s\S]*?\n {12}\}\);/,
  ]) {
    const hook = pattern.exec(setup);
    assert.ok(hook && installedAt > hook.index + hook[0].length);
  }
  const requested = 'native_update(Some(NativeEvent::PublicationRequested));';
  const returned = 'native_update(Some(NativeEvent::PublicationReturned));';
  const loadAt = publication.indexOf('_view.load_html(FIXTURE)?;');
  assert.ok(
    publication.indexOf(requested) >= 0 &&
      publication.indexOf(requested) < loadAt,
  );
  assert.ok(publication.indexOf(returned) > loadAt);
  for (const marker of [guardsInstalled, requested, returned])
    assert.equal(source.split(marker).length - 1, 1);
  assert.doesNotMatch(setup, /\.load_html\(|\.eval\(/);
  assert.match(publication, /_view\.load_html\(FIXTURE\)\?;/);
  assert.equal([...source.matchAll(/\.load_html\(/g)].length, 1);
  assert.equal(
    [...source.matchAll(/preview_browser_guards::install\(/g)].length,
    1,
  );
  assert.equal([...source.matchAll(/\.connect_load_failed\(/g)].length, 1);
  assert.equal(
    [...source.matchAll(/\.connect_web_process_terminated\(/g)].length,
    1,
  );
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

test('guarded native host observes loads before empty build and publishes once after native setup', async () => {
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

test('observation controls reject late or remapped callbacks and duplicate observation', async () => {
  const source = await readFile(host, 'utf8');
  assertEarlyObservation(source);
  const callback = callbackPattern.exec(source)[0];
  const late = source.replace(callback, '') + '\n' + callback;
  assert.notEqual(late, source);
  assert.throws(() => assertEarlyObservation(late));
  for (const [before, after] of [
    [
      'PageLoadEvent::Started => native_page(Some(NativeEvent::Committed))',
      'PageLoadEvent::Started => native_page(Some(NativeEvent::Finished))',
    ],
    [
      'PageLoadEvent::Finished => native_page(Some(NativeEvent::Finished))',
      'PageLoadEvent::Finished => native_page(Some(NativeEvent::Committed))',
    ],
    [callback, callback + callback],
    [callback, callback + '\nwebkit.connect_load_changed(|_, _| {});'],
    [
      callback,
      callback.replace(
        'match event {',
        'match event { _view.load_html(FIXTURE);',
      ),
    ],
    [
      callback,
      callback.replace('match event {', 'match event { _view.eval("x");'),
    ],
  ]) {
    const changed = source.replace(before, after);
    assert.notEqual(
      changed,
      source,
      'Each negative control must alter its target',
    );
    assert.throws(() => assertEarlyObservation(changed));
  }
});

test('publication controls reject constructor payloads, early or replaced publication and late hooks', async () => {
  const source = await readFile(host, 'utf8');
  assertEarlyObservation(source);
  const load = '_view.load_html(FIXTURE)?;';
  const guard = 'preview_browser_guards::install(&webkit)?;';
  const build = '.build_gtk(&plug)?';
  for (const [before, after] of [
    [build, '.with_html(FIXTURE)' + build],
    [build, '.with_url("about:blank")' + build],
    [load, '_view.load_html(OTHER)?;'],
    [load, load + load],
    [load, ''],
  ]) {
    const changed = source.replace(before, after);
    assert.notEqual(
      changed,
      source,
      'Each negative control must alter its target',
    );
    assert.throws(() => assertEarlyObservation(changed));
  }
  const early = source.replace(load, '').replace(guard, load + guard);
  assert.notEqual(early, source);
  assert.throws(() => assertEarlyObservation(early));
  const outside = source.replace(load, '') + '\n' + load;
  assert.notEqual(outside, source);
  assert.throws(() => assertEarlyObservation(outside));
  for (const pattern of [
    /webkit\.connect_load_failed\([\s\S]*?\n {12}\}\);/,
    /webkit\.connect_web_process_terminated\([\s\S]*?\n {12}\}\);/,
  ]) {
    const hook = pattern.exec(source)?.[0];
    assert.ok(hook, 'Each late-hook control must find its actual installation');
    const late = source.replace(hook, '') + '\n' + hook;
    assert.notEqual(late, source);
    assert.throws(() => assertEarlyObservation(late));
  }
});

test('native startup milestones reject early installation claims and misplaced publication observations', async () => {
  const source = await readFile(host, 'utf8');
  assertEarlyObservation(source);
  const installed = 'native_update(Some(NativeEvent::GuardsInstalled));';
  const requested = 'native_update(Some(NativeEvent::PublicationRequested));';
  const returned = 'native_update(Some(NativeEvent::PublicationReturned));';
  const load = '_view.load_html(FIXTURE)?;';
  const earlyGuardClaim = source
    .replace(installed, '')
    .replace(
      'preview_browser_guards::install(&webkit)?;',
      installed + 'preview_browser_guards::install(&webkit)?;',
    );
  const lateRequest = source
    .replace(requested, '')
    .replace(load, load + requested);
  const earlyReturn = source
    .replace(returned, '')
    .replace(load, returned + load);
  for (const changed of [
    earlyGuardClaim,
    lateRequest,
    earlyReturn,
    source.replace(
      'event == LoadEvent::Started',
      'event == LoadEvent::Committed',
    ),
    source.replace(
      'native_provisional(Some(NativeEvent::ProvisionalStarted));',
      '',
    ),
  ]) {
    assert.notEqual(
      changed,
      source,
      'Each negative control must alter its target',
    );
    assert.throws(() => assertEarlyObservation(changed));
  }
  const hook = /webkit\.connect_load_changed\([\s\S]*?\n {12}\}\);/.exec(
    source,
  )?.[0];
  assert.ok(hook);
  const lateProvisionalHook = source.replace(hook, '') + '\n' + hook;
  assert.notEqual(lateProvisionalHook, source);
  assert.throws(() => assertEarlyObservation(lateProvisionalHook));
});
