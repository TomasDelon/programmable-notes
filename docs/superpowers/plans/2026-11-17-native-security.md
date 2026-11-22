# Native runtime security plan

User scope: continue feat/mdx-react-engine and PR #1; do not merge or start visual editing/custom syntax.

- [x] Inspect baseline ADRs and cloud native prerequisites.
- [x] Add minimal Tauri 2 editor and separate unprivileged preview child with explicit ACL and backend caller denial.
- [x] Implement Linux service/cgroup supervisor, independent lifetime, whole-group stop, and no unrestricted fallback.
- [x] Verify effective controller values before delivering any author artifact.
- [x] Test Rust authorization/resource policy, frontend adapter ordering, configuration union and browser regressions.
- [x] Add real WebKitGTK/WebDriver automated assertions and Linux resource validation procedure.
- [ ] Execute actual native IPC/WebKitGTK/resource gates on a Linux desktop with the documented prerequisites. Cloud blockers are recorded; static tests are not substitutes.
- [ ] Publish measured native security results before approving hostile-document usage.

Preserve original handoff; document implementation/verification separately. Push to the existing branch and update PR #1 without merging. Report any API access denial independently of successful Git push.
