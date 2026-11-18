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
    return subprocess.check_output(['xdotool', *args], text=True, timeout=8).strip()

def window():
    try:
        ids = command('search', '--onlyvisible', '--name', '^' + re.escape(title) + '$').split()
        matches = [wid for wid in ids if command('getwindowpid', wid) == str(pid)]
        if len(matches) == 1:
            return matches[0]
    except subprocess.CalledProcessError:
        pass
    return None

def find(node, name, depth=0):
    if depth > 35:
        return None
    try:
        if node.getRoleName() == 'push button' and node.name.replace('_', '') == name:
            return node
        for child in node:
            match = find(child, name, depth + 1)
            if match is not None:
                return match
    except Exception:
        pass
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
    # Save choosers may select only the stem, leaving the old suffix selected out.
    command('key', '--clearmodifiers', 'ctrl+a')
    command('type', '--clearmodifiers', '--delay', '1', '--', argument)
    command('key', '--clearmodifiers', 'Return')
    # GtkFileChooser's location entry may first select, then require Open/Save.
    time.sleep(0.3)
    if window() is not None:
        click('Save' if title == 'Save source as' else 'Open')
elif mode == 'cancel':
    command('key', '--clearmodifiers', 'Escape')
elif mode == 'button':
    assert click(argument), f'Native confirmation button not found: {argument}'
else:
    raise ValueError('Unknown dialog action')
print(json.dumps({'pid': pid, 'title': title, 'action': mode, 'argument': argument}))
