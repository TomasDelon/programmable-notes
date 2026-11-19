"""Temporary synthetic clipboard owner, disposable desktop only."""
import os
import sys
assert os.environ.get('NATIVE_DISPOSABLE_PROFILE') == '1'
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib
text = sys.stdin.read()
clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
clipboard.set_text(text, -1)
print('OWNED_CLIPBOARD_READY', flush=True)
GLib.timeout_add(10000, lambda: (Gtk.main_quit(), False)[1])
Gtk.main()
