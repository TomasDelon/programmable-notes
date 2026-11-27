import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const prelude = `
import ast
import os
from pathlib import Path
import tempfile
source = Path('scripts/native-dialog.py').read_text()
tree = ast.parse(source)
definitions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('location_input_text', 'location_echo_shape')]
namespace = {}
# Execute only the actual pure production functions, never GTK imports/actions.
exec(compile(ast.Module(body=definitions, type_ignores=[]), '<native-dialog-pure>', 'exec'), namespace)
`;
function run(program) {
  const result = spawnSync('python3', ['-c', prelude + program], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'PASS\n');
}

test('folder input requests its explicit separator without changing the selected directory or file input', () => {
  run(`
typed = namespace['location_input_text']
with tempfile.TemporaryDirectory(prefix='pn-dialog-input-') as root:
    folder = Path(root) / 'vault space é'
    folder.mkdir()
    original = str(folder)
    assert typed('choose-folder', original) == original + '/'
    assert os.path.samefile(original, typed('choose-folder', original))
    assert typed('choose-folder', original + '/') == original + '/'
    assert typed('choose-folder', original + '//') == original + '//'
    assert typed('choose-folder', '/') == '/'
    assert typed('choose-folder', '//preserved-leading/path') == '//preserved-leading/path/'
    for value in (original, original + '/', '/file with space.mdx', '/raw\\nname.mdx'):
        assert typed('choose', value) == value
print('PASS')
`);
});

test('echo mismatch diagnosis returns only closed shapes and no marker shape for exact equality', () => {
  run(`
shape = namespace['location_echo_shape']
expected = '/private-sentinel/vault/'
cases = (
    (None, 'not_focused'),
    ('', 'empty'),
    (expected[:-1], 'missing_separator'),
    (expected + '/', 'extra_separator'),
    ('/private-sentinel/', 'shorter_prefix'),
    (expected + 'other', 'longer_prefix'),
    ('unrelated-private-sentinel', 'different'),
    (object(), 'different'),
)
for value, wanted in cases:
    result = shape(value, expected)
    assert result == wanted
    assert 'private-sentinel' not in result
assert shape(expected, expected) is None
assert shape('/', '/') is None
print('PASS')
`);
});

test('real helper types and checks one exact folder input with unchanged input timing and query count', () => {
  run(`
def assert_contract(text):
    parsed = ast.parse(text)
    calls = [node for node in ast.walk(parsed) if isinstance(node, ast.Call)]
    types = [node for node in calls if isinstance(node.func, ast.Name) and node.func.id == 'command' and node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 'type']
    assert len(types) == 1
    assert [node.value for node in types[0].args[:-1]] == ['type', '--clearmodifiers', '--delay', '1', '--']
    assert ast.dump(types[0].args[-1]) == ast.dump(ast.Name(id='typed_path', ctx=ast.Load()))
    focused = [node for node in calls if isinstance(node.func, ast.Name) and node.func.id == 'focused_entry_text']
    assert len(focused) == 4
    assignment = [node for node in ast.walk(parsed) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'typed_path' for target in node.targets)]
    assert len(assignment) == 1 and ast.unparse(assignment[0].value) == 'location_input_text(mode, argument)'
    final_read = [node for node in ast.walk(parsed) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'observed_echo' for target in node.targets)]
    assert len(final_read) == 1 and ast.unparse(final_read[0].value) == 'focused_entry_text()'
    assert any(isinstance(node, ast.While) and ast.unparse(node.test) == 'focused_entry_text() != typed_path and time.monotonic() < deadline' for node in ast.walk(parsed))
    assert any(isinstance(node, ast.Assert) and ast.unparse(node.test) == 'observed_echo == typed_path' and isinstance(node.msg, ast.Constant) and node.msg.value == 'Native location entry did not echo the exact fixture path' for node in ast.walk(parsed))
    mismatch = [node for node in ast.walk(parsed) if isinstance(node, ast.If) and ast.unparse(node.test) == 'observed_echo != typed_path']
    assert len(mismatch) == 1 and len(mismatch[0].body) == 1
    marker = mismatch[0].body[0].value
    assert isinstance(marker, ast.Call) and ast.unparse(marker.func) == 'print'
    assert ast.unparse(marker.args[0]) == "'NATIVE_DIALOG_ECHO_SHAPE=' + location_echo_shape(observed_echo, typed_path)"
    assert len(marker.keywords) == 1 and marker.keywords[0].arg == 'file' and ast.unparse(marker.keywords[0].value) == 'sys.stderr'
    assert any(isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'deadline' for target in node.targets) and ast.unparse(node.value) == 'time.monotonic() + 30' for node in ast.walk(parsed))
    assert "command('key', '--clearmodifiers', 'Return')" in text
    assert "assert window() is None, f'Native dialog did not acknowledge {mode}: {title}'" in text
assert_contract(source)
for old, new in (
    ("'--', typed_path)", "'--', argument)"),
    ('focused_entry_text() != typed_path', 'focused_entry_text() != argument'),
    ('observed_echo == typed_path', 'observed_echo == argument'),
    ('observed_echo == typed_path', 'observed_echo.startswith(typed_path)'),
    ("'--delay', '1'", "'--delay', '10'"),
    ('time.monotonic() + 30', 'time.monotonic() + 31'),
    ('observed_echo = focused_entry_text()', 'observed_echo = focused_entry_text()\\n    focused_entry_text()'),
):
    assert old in source
    try:
        assert_contract(source.replace(old, new))
    except (AssertionError, SyntaxError):
        pass
    else:
        raise AssertionError('mutated input contract was accepted')
print('PASS')
`);
});
