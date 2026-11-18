# Additional measured desktop configuration

Before this final check, the relevant values were:

- kernel.unprivileged_userns_clone=1
- kernel.apparmor_restrict_unprivileged_userns=1
- kernel.apparmor_restrict_unprivileged_unconfined=0

Only the third setting was tightened to1 in this disposable VM. The unchanged
release binary, named app profile, distribution unprivileged_userns profile and
separate administrator executor opt-in have identical before/after SHA256s.
No product/profile file was edited and no restriction was relaxed for this check.

With all three *listed* values now1, the ordinary UID1000 desktop software-mode
probe passed the unchanged strict editor and actual production-child WebProcess
observers, externally clicked the default Counter0→1→2, and captured Counter2.
The live preview then stopped through normal editor WM_DELETE_WINDOW; the editor,
preview group and known WebProcesses exited without forced cleanup. Software
rendering switches were1; inspector/automation were absent in the editor and
disabled in the child. Child limits and RuntimeMaxSec60 were unchanged. Actual
whole-controller elapsed80381ms; actual command exit0 was captured separately.

This adds only the desktop/sandbox/Counter/normal-close observations executed
under the new third setting. The filesystem/stress matrix, renderer-flags-absent
probe, physical GPU and Wayland were not repeated under this setting. It is not
a shipping guarantee or a claim that every kernel/AppArmor hardening option was
enabled/tested. Earlier results are preserved in their original configuration.

The final-state log confirms the third setting remains1 and no app or preview
unit remains. The VM is intact for parent evidence collection and cleanup.
