"""Trusted external GTK dialog driver. No application-side test filesystem API."""
import json
import re
import subprocess
import sys
import time
import pyatspi

pid = int(sys.argv[1])
mode = sys.argv[2]
title = sys.argv[3]
argument = sys.argv[4] if len(sys.argv) > 4 else ''

def command(*args):
    return subprocess.check_output(['xdotool', *args], text=True, stderr=subprocess.PIPE, timeout=8).strip()

def window():
    while True:
        try:
            ids = command('search', '--onlyvisible', '--name', '^' + re.escape(title) + '$').split()
            break
        except subprocess.CalledProcessError as error:
            if error.returncode == 1 and not error.output.strip() and not error.stderr.strip():
                return None  # xdotool's documented no-match result.
            # Window enumeration itself races GTK destruction. Retry only this
            # read, within the same deadline; never turn a failed query into absence.
            transient = ('BadWindow' in error.stderr or
                         ('BadDrawable' in error.stderr and 'X_GetGeometry' in error.stderr))
            if transient and time.monotonic() < deadline:
                time.sleep(0.05)
                continue
            raise RuntimeError(f'Native window query failed: {error.output!r} {error.stderr!r}') from error
    matches = []
    for wid in ids:
        try:
            if command('getwindowpid', wid) == str(pid):
                matches.append(wid)
        except subprocess.CalledProcessError as error:
            # The dialog can disappear between search and property lookup.
            if 'BadWindow' not in error.stderr:
                raise
    assert len(matches) <= 1, f'Ambiguous native dialogs for PID {pid}: {title}'
    return matches[0] if matches else None

def find(node, name, depth=0):
    if depth > 35:
        return None
    try:
        if node.getRoleName() == 'push button' and node.name.replace('_', '') == name:
            state = node.getState()
            if all(state.contains(flag) for flag in (
                    pyatspi.STATE_VISIBLE, pyatspi.STATE_SHOWING,
                    pyatspi.STATE_ENABLED, pyatspi.STATE_SENSITIVE)):
                return node
        for child in node:
            match = find(child, name, depth + 1)
            if match is not None:
                return match
    except Exception:
        pass
    return None

def focused_entry_text():
    def scan(node, depth=0):
        if depth > 35:
            return None
        try:
            state = node.getState()
            if state.contains(pyatspi.STATE_FOCUSED) and state.contains(pyatspi.STATE_EDITABLE):
                return node.queryText().getText(0, -1)
            for child in node:
                value = scan(child, depth + 1)
                if value is not None:
                    return value
        except Exception:
            pass
        return None
    for app in pyatspi.Registry.getDesktop(0):
        if app.get_process_id() == pid:
            for child in app:
                if child.name == title:
                    value = scan(child)
                    if value is not None:
                        return value
    return None

def click(name):
    for app in pyatspi.Registry.getDesktop(0):
        try:
            if app.get_process_id() != pid:
                continue
            button = find(app, name)
            if button is not None:
                assert button.queryAction().doAction(0)
                return True
        except Exception:
            continue
    return False

deadline = time.monotonic() + 30
wid = None
while time.monotonic() < deadline:
    wid = window()
    if wid is not None:
        break
    time.sleep(0.1)
assert wid is not None, f'Native dialog not visible for PID {pid}: {title}'
command('windowactivate', '--sync', wid)
if mode == 'choose':
    assert argument.startswith('/'), 'Use an absolute fixture path'
    command('key', '--clearmodifiers', 'ctrl+l')
    # X11 key delivery does not acknowledge GTK focus or path-entry creation.
    while focused_entry_text() is None and time.monotonic() < deadline:
        time.sleep(0.1)
    assert focused_entry_text() is not None, 'Native location entry did not focus'
    # Save choosers may select only the stem, leaving the old suffix selected out.
    command('key', '--clearmodifiers', 'ctrl+a')
    command('type', '--clearmodifiers', '--delay', '1', '--', argument)
    while focused_entry_text() != argument and time.monotonic() < deadline:
        time.sleep(0.1)
    assert focused_entry_text() == argument, 'Native location entry did not echo the exact fixture path'
    command('key', '--clearmodifiers', 'Return')
    # GtkFileChooser's location entry may first select, then require Open/Save.
    time.sleep(0.3)
    while window() is not None and time.monotonic() < deadline:
        if click('Save' if title == 'Save source as' else 'Open'):
            break
        time.sleep(0.1)
elif mode == 'cancel':
    command('key', '--clearmodifiers', 'Escape')
elif mode == 'button':
    assert click(argument), f'Native confirmation button not found: {argument}'
else:
    raise ValueError('Unknown dialog action')
# A successful AT-SPI action may still be refused or pending. Do not invent
# chooser acceptance, automatically confirm replacement, or retry an acknowledged click.
while window() is not None and time.monotonic() < deadline:
    time.sleep(0.1)
assert window() is None, f'Native dialog did not acknowledge {mode}: {title}'
print(json.dumps({'pid': pid, 'title': title, 'action': mode, 'argument': argument,
                  'dialogDismissed': True}))
