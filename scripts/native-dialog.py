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
accept_state = 'not_attempted'
accept_lookup = 'not_attempted'

def location_accept_label(action, dialog_title):
    # rfd 0.17.2 supplies NULL accept-label. GTK 3.24.41
    # gtkfilechoosernative.c show_dialog defaults SAVE to _Save, all others to
    # _Open (blob 76f7cb6da89b33bad30f9cc934e4e1eddb4463ac).
    if action == 'choose-folder':
        return 'Open'
    if action == 'choose':
        return 'Save' if dialog_title == 'Save source as' else 'Open'
    raise ValueError('Unknown chooser action')

def location_input_text(action, value):
    # GTK 3.24.41 gtkfilechooserentry.c enables folder inline completion and
    # includes a separator in directory completions (blob 02f9d5542f1a49ffd9481850cc4a081d6ed4d72a).
    # Request that exact directory spelling rather than accepting a prefix.
    if action == 'choose-folder' and not value.endswith('/'):
        return value + '/'
    return value

def location_echo_shape(observed, expected):
    # Advisory only: never disclose the text or relax the exact echo oracle.
    if observed is None:
        return 'not_focused'
    if not isinstance(observed, str):
        return 'different'
    if observed == expected:
        return None
    if observed == '':
        return 'empty'
    if expected.endswith('/') and observed == expected[:-1]:
        return 'missing_separator'
    if observed == expected + '/':
        return 'extra_separator'
    if expected.startswith(observed):
        return 'shorter_prefix'
    if observed.startswith(expected):
        return 'longer_prefix'
    return 'different'

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
    global accept_lookup
    if depth > 35:
        return None
    try:
        if node.getRoleName() == 'push button' and node.name.replace('_', '') == name:
            accept_lookup = 'button_unreadable'
            state = node.getState()
            flags = tuple(state.contains(flag) for flag in (
                    pyatspi.STATE_VISIBLE, pyatspi.STATE_SHOWING,
                    pyatspi.STATE_ENABLED, pyatspi.STATE_SENSITIVE))
            accept_lookup = 'button_flags_' + ''.join('1' if flag else '0' for flag in flags)
            if all(flags):
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
    global accept_state, accept_lookup
    accept_state = 'not_found'
    accept_lookup = 'dialog_not_found'
    dialogs = []
    # Match the same owned top-level topology as focused_entry_text. Establish
    # uniqueness across every matching application before touching any action.
    for app in pyatspi.Registry.getDesktop(0):
        if app.get_process_id() == pid:
            dialogs.extend(child for child in app if child.name == title)
    assert len(dialogs) <= 1, 'Ambiguous native accessibility dialogs'
    if not dialogs:
        return False
    accept_lookup = 'button_not_found'
    try:
        button = find(dialogs[0], name)
        if button is not None:
            accept_state = 'action_error'
            acknowledged = button.queryAction().doAction(0)
            accept_state = 'action_acknowledged' if acknowledged else 'action_rejected'
            assert acknowledged
            return True
    except Exception:
        pass
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
if mode in ('choose', 'choose-folder'):
    assert argument.startswith('/'), 'Use an absolute fixture path'
    typed_path = location_input_text(mode, argument)
    command('key', '--clearmodifiers', 'ctrl+l')
    # X11 key delivery does not acknowledge GTK focus or path-entry creation.
    while focused_entry_text() is None and time.monotonic() < deadline:
        time.sleep(0.1)
    assert focused_entry_text() is not None, 'Native location entry did not focus'
    # Save choosers may select only the stem, leaving the old suffix selected out.
    command('key', '--clearmodifiers', 'ctrl+a')
    command('type', '--clearmodifiers', '--delay', '1', '--', typed_path)
    while focused_entry_text() != typed_path and time.monotonic() < deadline:
        time.sleep(0.1)
    observed_echo = focused_entry_text()
    if observed_echo != typed_path:
        print('NATIVE_DIALOG_ECHO_SHAPE=' + location_echo_shape(observed_echo, typed_path), file=sys.stderr)
    assert observed_echo == typed_path, 'Native location entry did not echo the exact fixture path'
    command('key', '--clearmodifiers', 'Return')
    # GtkFileChooser's location entry may first select, then require Open/Save.
    time.sleep(0.3)
    while window() is not None and time.monotonic() < deadline:
        accept = location_accept_label(mode, title)
        if click(accept):
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
dialog_dismissed = window() is None
if not dialog_dismissed and mode in ('choose', 'choose-folder'):
    print('NATIVE_DIALOG_ACCEPT_STATE=' + accept_state, file=sys.stderr)
    print('NATIVE_DIALOG_ACCEPT_LOOKUP=' + accept_lookup, file=sys.stderr)
assert dialog_dismissed, f'Native dialog did not acknowledge {mode}: {title}'
print(json.dumps({'pid': pid, 'title': title, 'action': mode, 'argument': argument,
                  'dialogDismissed': True}))
