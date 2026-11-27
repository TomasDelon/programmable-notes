//! Trusted fixed compilation only. No GTK host or generated JavaScript runs here.
use std::{
    env,
    path::PathBuf,
    process::{Command, Stdio},
};

const COMPILE: &str = r#"
import {createHash, randomBytes} from 'node:crypto';
import {lstat, open, readFile, rename, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
try {
  const args = process.argv.slice(1);
  if (args.length !== 2) throw Error('fixed build');
  const [manifestDir, outputDir] = args;
  if (!(await lstat(outputDir)).isDirectory()) throw Error('fixed output');
  const repository = resolve(manifestDir, '../../..');
  const version = (await readFile(join(repository, '.nvmrc'), 'utf8')).trim();
  if (process.version !== 'v' + version) throw Error('fixed Node version');
  const {compileFixture} = await import(pathToFileURL(resolve(manifestDir, '../compile.mjs')));
  const {html, manifest} = await compileFixture();
  if (!Buffer.isBuffer(html) || !html.length || html.length > 4 * 1024 * 1024 ||
      !Buffer.isBuffer(manifest) || !manifest.length || manifest.length > 16384)
    throw Error('fixed artifacts');
  const receipt = JSON.parse(manifest);
  if (receipt.profile !== 'inline-react-v1' || receipt.nativeTested !== false ||
      receipt.generatedCodeEvaluatedOnHost !== false || receipt.artifacts.htmlBytes !== html.length ||
      receipt.artifacts.htmlSha256 !== createHash('sha256').update(html).digest('hex'))
    throw Error('fixed receipt');
  async function publish(name, bytes) {
    const temporary = join(outputDir, '.' + name + '-' + randomBytes(16).toString('hex'));
    const file = await open(temporary, 'wx', 0o600);
    try {
      try { await file.writeFile(bytes); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, join(outputDir, name));
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  await publish('fixture.html', html);
  await publish('fixture-manifest.json', manifest);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifest.length);
  await publish('fixture-evidence.bin', Buffer.concat([
    Buffer.from('PN_INLINE_REACT_V1_BUILD\0'), length, manifest,
    Buffer.from('\0PN_INLINE_REACT_V1_BUILD_END\0'),
  ]));
} catch {
  process.exitCode = 2;
}
"#;

fn main() {
    assert_eq!(
        env::args_os().count(),
        1,
        "Fixed build accepts no arguments"
    );
    for input in [
        "../compile.mjs",
        "../document.mdx",
        "../../../package.json",
        "../../../package-lock.json",
        "../../../.nvmrc",
        "../../../node_modules/@mdx-js/mdx/package.json",
        "../../../node_modules/esbuild/package.json",
        "../../../node_modules/react/package.json",
        "../../../node_modules/react-dom/package.json",
        "../../../node_modules/scheduler/package.json",
    ] {
        println!("cargo:rerun-if-changed={input}");
    }
    println!("cargo:rerun-if-env-changed=PATH");
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let output = env::var_os("OUT_DIR").expect("Cargo OUT_DIR is required");
    let status = Command::new("node")
        .args(["--input-type=module", "--eval", COMPILE])
        .arg(&manifest)
        .arg(output)
        .current_dir(&manifest)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env_remove("ESBUILD_BINARY_PATH")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("Fixed fixture compiler could not start");
    assert!(status.success(), "Fixed fixture compilation failed");
}
