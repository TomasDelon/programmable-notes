"""Trusted external UI driver; never injected into document code."""
import json
import sys
import time
import pyatspi

pid = int(sys.argv[1])
name = sys.argv[2]
action = sys.argv[3] if len(sys.argv) > 3 else 'click'
limit = time.monotonic() + 45

def find(node, depth=0):
    if depth > 30:
        return None
    try:
        if node.name == name and node.getRoleName() == 'push button':
            return node
        for child in node:
            match = find(child, depth + 1)
            if match is not None:
                return match
    except Exception:
        return None
    return None

while time.monotonic() < limit:
    for app in pyatspi.Registry.getDesktop(0):
        try:
            if app.get_process_id() != pid:
                continue
            button = find(app)
            if button is not None:
                if action == 'click':
                    assert button.queryAction().doAction(0), 'Native action was rejected'
                print(json.dumps({'pid': pid, 'button': name, 'action': action, 'passed': True}))
                sys.exit(0)
        except Exception:
            continue
    time.sleep(0.1)
raise RuntimeError('Native accessible button not found: %s for PID %d' % (name, pid))
