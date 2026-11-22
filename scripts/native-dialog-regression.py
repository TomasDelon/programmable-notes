"""Real GTK negative fixture: never report a refused chooser action as success."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

TITLE = 'Delayed synthetic Open'
SOURCE = b'# Synthetic chooser\r\n\r\nNever modify this file.\r\n'


def fixture(root):
    import gi
    gi.require_version('Gtk', '3.0')
    from gi.repository import Gtk, GLib
    # A real GTK dialog with an explicitly delayed validator. No file-chooser
    # internals may defer Enter for us and accidentally mask the driver's bug.
    dialog = Gtk.Dialog(title=TITLE)
    dialog.add_buttons('_Cancel', Gtk.ResponseType.CANCEL, '_Open', Gtk.ResponseType.ACCEPT)
    entry = Gtk.Entry()
    dialog.get_content_area().add(entry)
    entry.connect('activate', lambda _entry: (root / 'attempted').touch())

    def update():
        released = (root / 'release').exists()
        dialog.set_response_sensitive(Gtk.ResponseType.ACCEPT, released)
        if entry.get_text() == str(root / 'source.mdx'):
            (root / 'selected').touch(exist_ok=True)
        return True

    def response(_dialog, result):
        if result == Gtk.ResponseType.ACCEPT and not (root / 'release').exists():
            return  # Deliberately refuse early validation/activation.
        assert result == Gtk.ResponseType.ACCEPT, result
        (root / 'accepted.json').write_text(json.dumps({'file': entry.get_text()}))
        dialog.destroy()
        Gtk.main_quit()

    dialog.connect('response', response)
    dialog.show_all()
    entry.grab_focus()
    update()
    GLib.timeout_add(20, update)
    (root / 'ready').touch()
    Gtk.main()


def wait_for(predicate, seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError('Native fixture condition not observed')


if len(sys.argv) == 3 and sys.argv[1] == '--fixture':
    fixture(Path(sys.argv[2]))
else:
    assert os.environ.get('NATIVE_DISPOSABLE_PROFILE') == '1'
    fault = sys.argv[1] if len(sys.argv) == 2 else 'none'
    assert fault in ('none', '--query-fault-once', '--query-fault-persistent')
    driver_path = Path('scripts/native-dialog.py').resolve()
    report = {'scope': 'real GTK dialog with delayed validation; no application API or disk write'}
    report['queryFault'] = fault
    report['driverSha256'] = hashlib.sha256(driver_path.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='pn-dialog-regression-') as directory:
        root = Path(directory)
        target = root / 'source.mdx'
        target.write_bytes(SOURCE)
        target.chmod(0o640)
        driver_env = dict(os.environ)
        if fault != 'none':
            binary = root / 'bin'
            binary.mkdir()
            wrapper = binary / 'xdotool'
            wrapper.write_text('''#!/usr/bin/python3
import os, pathlib, sys
root=pathlib.Path(ROOT)
persistent=PERSISTENT
if sys.argv[1:2]==['search'] and (root/'accepted.json').exists() and (persistent or not (root/'injected').exists()):
 (root/'injected').touch()
 sys.stderr.write('X Error of failed request:  BadDrawable (invalid Pixmap or Window parameter)\\n  Major opcode of failed request:  14 (X_GetGeometry)\\n')
 sys.exit(1)
os.execv('/usr/bin/xdotool',['xdotool',*sys.argv[1:]])
'''.replace('ROOT', repr(str(root))).replace('PERSISTENT', str(fault == '--query-fault-persistent')))
            wrapper.chmod(0o700)
            driver_env['PATH'] = str(binary) + os.pathsep + os.environ['PATH']
        child = subprocess.Popen([sys.executable, __file__, '--fixture', directory])
        driver = None
        try:
            wait_for(lambda: (root / 'ready').exists(), 15)
            driver = subprocess.Popen([sys.executable, str(driver_path), str(child.pid),
                                       'choose', TITLE, str(target)],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=driver_env)
            wait_for(lambda: (root / 'attempted').exists() or driver.poll() is not None, 20)
            # The fixture's validation is explicitly held after the requested file is selected.
            # Correct UI automation must remain pending rather than report a refused action.
            deadline = time.monotonic() + 10
            while driver.poll() is None and time.monotonic() < deadline:
                time.sleep(0.05)
            report['prematureSuccess'] = driver.poll() == 0 and not (root / 'accepted.json').exists()
            (root / 'release').touch()
            stdout, stderr = driver.communicate(timeout=35)
            report.update(driverExit=driver.returncode, stdout=stdout, stderr=stderr)
            assert not report['prematureSuccess'], 'Driver reported success before chooser accepted'
            wait_for(lambda: (root / 'accepted.json').exists(), 5)
            assert json.loads((root / 'accepted.json').read_text())['file'] == str(target)
            assert child.wait(timeout=5) == 0
            assert target.read_bytes() == SOURCE and target.stat().st_mode & 0o777 == 0o640
            report['actualAcceptanceAndUnchangedSource'] = True
            if fault != 'none':
                assert (root / 'injected').exists(), 'Fault was not exercised'
            if fault == '--query-fault-persistent':
                assert driver.returncode != 0 and 'Native window query failed' in stderr, report
                assert 'dialogDismissed' not in stdout, report
                report['persistentQueryFailureRefused'] = True
            else:
                assert driver.returncode == 0, report
            print('NATIVE_DIALOG_REGRESSION_PASS', json.dumps(report))
        finally:
            if driver is not None and driver.poll() is None:
                driver.terminate()
                driver.wait(timeout=5)
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            print('NATIVE_DIALOG_REGRESSION_REPORT', json.dumps(report))
