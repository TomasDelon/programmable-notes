//! Lifetime-bound editor close admission; contains no filesystem or window authority.
/// Negotiation cannot adopt a post-install process; ordinary close may restart it.
pub(crate) fn update_blocks_close(
    installation_latched: bool,
    active_update: bool,
    negotiating: bool,
) -> bool {
    if negotiating {
        installation_latched
    } else {
        active_update
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Phase {
    #[default]
    Idle,
    Requested,
    Committing,
    Uncertain,
}
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Busy {
    pub operations: usize,
    pub dialog: bool,
    pub installing: bool,
    pub renderer_stopped: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Action {
    Cancel,
    Commit,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Decision {
    Legacy,
    Prevent,
    Permit,
}
#[derive(Debug, Default)]
pub(crate) struct Gate {
    epoch: Option<String>,
    request: Option<String>,
    phase: Phase,
    permit: bool,
    authority_used: bool,
    legacy_close_seen: bool,
}
impl Busy {
    fn clear(self) -> bool {
        self.operations == 0 && !self.dialog && !self.installing && !self.renderer_stopped
    }
}
impl Gate {
    pub fn enable(&mut self, version: u8, epoch: String, busy: Busy) -> Result<(), &'static str> {
        if version != 1 {
            return Err("Unsupported editor close protocol");
        }
        if self.authority_used || self.legacy_close_seen || !busy.clear() {
            return Err("Editor close guard must precede native authority and closing");
        }
        if self.phase != Phase::Idle {
            return Err("Editor close guard is unavailable");
        }
        if self.epoch.is_none() {
            self.epoch = Some(epoch);
        }
        Ok(())
    }
    pub fn reserve_authority(&mut self) -> Result<(), &'static str> {
        if self.frozen() {
            return Err("Editor close commit is frozen; operation refused");
        }
        self.authority_used = true;
        Ok(())
    }
    pub fn close(&mut self, new_request: Option<String>, busy: Busy) -> Decision {
        if !self.guarded() {
            self.legacy_close_seen = true;
            return Decision::Legacy;
        }
        if self.phase == Phase::Committing && self.permit {
            self.permit = false;
            if busy.clear() {
                return Decision::Permit;
            }
            self.phase = Phase::Uncertain;
            return Decision::Prevent;
        }
        if self.phase == Phase::Idle {
            if let Some(request) = new_request {
                self.request = Some(request);
                self.phase = Phase::Requested;
            }
        }
        Decision::Prevent
    }
    pub fn resolve(
        &mut self,
        epoch: &str,
        request: &str,
        action: Action,
        busy: Busy,
    ) -> Result<(), &'static str> {
        self.verify_epoch(epoch)?;
        if self.phase != Phase::Requested || self.request.as_deref() != Some(request) {
            return Err("Stale editor close request");
        }
        match action {
            Action::Cancel => {
                self.phase = Phase::Idle;
                self.request = None;
            }
            Action::Commit => {
                if !busy.clear() {
                    return Err("Native operation, dialog, update or renderer prevents close");
                }
                self.phase = Phase::Committing;
                self.permit = true;
            }
        }
        Ok(())
    }
    pub fn renderer_stopped(&mut self) {
        self.mark_uncertain();
    }
    pub fn mark_uncertain(&mut self) {
        if self.guarded() {
            self.permit = false;
            self.phase = Phase::Uncertain;
        }
    }
    pub fn epoch(&self) -> Option<&str> {
        self.epoch.as_deref()
    }
    pub fn request(&self) -> Option<&str> {
        self.request.as_deref()
    }
    pub fn phase(&self) -> Phase {
        self.phase
    }
    pub fn guarded(&self) -> bool {
        self.epoch.is_some()
    }
    pub fn frozen(&self) -> bool {
        matches!(self.phase, Phase::Committing | Phase::Uncertain)
    }
    pub fn busy_for_install(&self) -> bool {
        self.guarded() && self.phase != Phase::Idle
    }
    pub fn verify_epoch(&self, epoch: &str) -> Result<(), &'static str> {
        if self.epoch() == Some(epoch) {
            Ok(())
        } else {
            Err("Unknown editor close epoch")
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn enabled() -> Gate {
        let mut gate = Gate::default();
        gate.enable(1, "epoch".into(), Busy::default()).unwrap();
        gate
    }
    fn requested() -> Gate {
        let mut gate = enabled();
        assert_eq!(
            gate.close(Some("request".into()), Busy::default()),
            Decision::Prevent
        );
        gate
    }
    #[test]
    fn post_install_latch_blocks_negotiation_but_allows_ordinary_close() {
        assert!(update_blocks_close(true, true, false));
        assert!(update_blocks_close(true, false, true));
        assert!(!update_blocks_close(true, false, false));
        assert!(!update_blocks_close(false, false, false));
        let mut gate = requested();
        gate.resolve(
            "epoch",
            "request",
            Action::Commit,
            Busy {
                installing: update_blocks_close(true, false, false),
                ..Busy::default()
            },
        )
        .unwrap();
        assert_eq!(
            gate.close(
                None,
                Busy {
                    installing: update_blocks_close(true, false, false),
                    ..Busy::default()
                }
            ),
            Decision::Permit
        );
    }
    #[test]
    fn clean_booleans_do_not_release_guarded_close() {
        let mut gate = enabled();
        assert_eq!(
            gate.close(Some("request".into()), Busy::default()),
            Decision::Prevent
        );
        assert_eq!(gate.phase(), Phase::Requested);
        assert_eq!(gate.request(), Some("request"));
    }
    #[test]
    fn commit_is_exact_and_one_shot() {
        let mut gate = requested();
        gate.resolve("epoch", "request", Action::Commit, Busy::default())
            .unwrap();
        assert!(gate.frozen());
        assert_eq!(gate.close(None, Busy::default()), Decision::Permit);
        assert_eq!(
            gate.close(Some("foreign".into()), Busy::default()),
            Decision::Prevent
        );
        assert!(gate
            .resolve("epoch", "request", Action::Commit, Busy::default())
            .is_err());
        assert!(gate.reserve_authority().is_err());
    }
    #[test]
    fn cancel_never_rearms_a_stale_request() {
        let mut gate = requested();
        gate.resolve("epoch", "request", Action::Cancel, Busy::default())
            .unwrap();
        assert_eq!(gate.phase(), Phase::Idle);
        assert_eq!(gate.request(), None);
        assert!(gate
            .resolve("epoch", "request", Action::Commit, Busy::default())
            .is_err());
        assert_eq!(
            gate.close(Some("next".into()), Busy::default()),
            Decision::Prevent
        );
        assert_eq!(gate.request(), Some("next"));
    }
    #[test]
    fn wrong_epoch_request_version_and_duplicate_negotiation_fail_closed() {
        let mut gate = Gate::default();
        assert!(gate.enable(2, "epoch".into(), Busy::default()).is_err());
        assert!(!gate.guarded());
        gate.enable(1, "epoch".into(), Busy::default()).unwrap();
        gate.enable(1, "ignored".into(), Busy::default()).unwrap();
        assert_eq!(gate.epoch(), Some("epoch"));
        gate.close(Some("request".into()), Busy::default());
        assert!(gate
            .resolve("wrong", "request", Action::Commit, Busy::default())
            .is_err());
        assert!(gate
            .resolve("epoch", "wrong", Action::Commit, Busy::default())
            .is_err());
        assert_eq!(gate.phase(), Phase::Requested);
    }
    #[test]
    fn authority_or_legacy_close_blocks_late_negotiation() {
        let mut gate = Gate::default();
        gate.reserve_authority().unwrap();
        assert!(gate.enable(1, "epoch".into(), Busy::default()).is_err());
        let mut gate = Gate::default();
        assert_eq!(gate.close(None, Busy::default()), Decision::Legacy);
        assert!(gate.enable(1, "epoch".into(), Busy::default()).is_err());
    }
    #[test]
    fn active_operation_dialog_install_or_stopped_renderer_refuse_negotiation_and_commit() {
        for busy in [
            Busy {
                operations: 1,
                ..Busy::default()
            },
            Busy {
                dialog: true,
                ..Busy::default()
            },
            Busy {
                installing: true,
                ..Busy::default()
            },
            Busy {
                renderer_stopped: true,
                ..Busy::default()
            },
        ] {
            assert!(Gate::default().enable(1, "epoch".into(), busy).is_err());
            let mut gate = requested();
            assert!(gate
                .resolve("epoch", "request", Action::Commit, busy)
                .is_err());
            assert_eq!(gate.phase(), Phase::Requested);
            assert_eq!(gate.close(None, Busy::default()), Decision::Prevent);
        }
    }
    #[test]
    fn permit_consumption_rechecks_native_busy_state() {
        for busy in [
            Busy {
                operations: 1,
                ..Busy::default()
            },
            Busy {
                dialog: true,
                ..Busy::default()
            },
            Busy {
                installing: true,
                ..Busy::default()
            },
            Busy {
                renderer_stopped: true,
                ..Busy::default()
            },
        ] {
            let mut gate = requested();
            gate.resolve("epoch", "request", Action::Commit, Busy::default())
                .unwrap();
            assert_eq!(gate.close(None, busy), Decision::Prevent);
            assert_eq!(gate.phase(), Phase::Uncertain);
            assert!(gate.frozen());
            assert!(gate
                .resolve("epoch", "request", Action::Cancel, Busy::default())
                .is_err());
        }
    }
    #[test]
    fn renderer_death_revokes_permit_and_never_falls_back_to_legacy() {
        let mut gate = requested();
        gate.resolve("epoch", "request", Action::Commit, Busy::default())
            .unwrap();
        gate.renderer_stopped();
        assert_eq!(gate.phase(), Phase::Uncertain);
        assert_eq!(gate.close(None, Busy::default()), Decision::Prevent);
        assert!(gate.busy_for_install());
    }
    #[test]
    fn ordinary_repeat_close_coalesces_existing_request() {
        let mut gate = requested();
        assert_eq!(
            gate.close(Some("foreign".into()), Busy::default()),
            Decision::Prevent
        );
        assert_eq!(gate.request(), Some("request"));
        assert!(gate.busy_for_install());
    }
    #[test]
    fn missing_request_entropy_keeps_idle_guard_protected() {
        let mut gate = enabled();
        assert_eq!(gate.close(None, Busy::default()), Decision::Prevent);
        assert_eq!(gate.phase(), Phase::Idle);
        assert!(gate.verify_epoch("wrong").is_err());
    }
}
