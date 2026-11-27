//! Passive fixed diagnostic state. Completion is not JavaScript success.

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum Termination {
    #[default]
    None,
    Crashed,
    MemoryLimit,
    ApiTerminated,
    Unknown,
}

impl Termination {
    fn label(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Crashed => "crashed",
            Self::MemoryLimit => "memory_limit",
            Self::ApiTerminated => "api_terminated",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Event {
    Built,
    Committed,
    Finished,
    NavigationDenied,
    LoadFailed,
    Terminated(Termination),
}

#[derive(Default)]
pub(crate) struct Snapshot {
    built: bool,
    committed: bool,
    finished: bool,
    navigation_denied: bool,
    load_failed: bool,
    termination: Termination,
}

impl Snapshot {
    pub(crate) fn record(&mut self, event: Event) {
        match event {
            Event::Built => self.built = true,
            Event::Committed => self.committed = true,
            Event::Finished => self.finished = true,
            Event::NavigationDenied => self.navigation_denied = true,
            Event::LoadFailed => self.load_failed = true,
            Event::Terminated(reason) if self.termination == Termination::None => {
                self.termination = reason;
            }
            Event::Terminated(_) => (),
        }
    }

    pub(crate) fn json(&self) -> String {
        format!(
            "{{\"version\":1,\"built\":{},\"committed\":{},\"finished\":{},\"navigation_denied\":{},\"load_failed\":{},\"termination\":\"{}\"}}",
            self.built, self.committed, self.finished, self.navigation_denied,
            self.load_failed, self.termination.label()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_snapshot_has_only_the_seven_fixed_fields() {
        assert_eq!(
            Snapshot::default().json(),
            r#"{"version":1,"built":false,"committed":false,"finished":false,"navigation_denied":false,"load_failed":false,"termination":"none"}"#
        );
    }

    #[test]
    fn flags_are_sticky_and_finish_is_independent_of_build_and_commit() {
        let mut snapshot = Snapshot::default();
        snapshot.record(Event::Finished);
        assert!(snapshot.finished);
        assert!(!snapshot.built && !snapshot.committed);
        for event in [
            Event::Built,
            Event::Committed,
            Event::NavigationDenied,
            Event::LoadFailed,
        ] {
            snapshot.record(event);
            snapshot.record(Event::Finished);
        }
        assert!(
            snapshot.built
                && snapshot.committed
                && snapshot.finished
                && snapshot.navigation_denied
                && snapshot.load_failed
        );
    }

    #[test]
    fn page_events_during_construction_survive_the_later_built_event_in_either_order() {
        for events in [
            [Event::Committed, Event::Finished],
            [Event::Finished, Event::Committed],
        ] {
            let mut snapshot = Snapshot::default();
            for event in events {
                snapshot.record(event);
            }
            assert!(!snapshot.built);
            assert!(snapshot.committed && snapshot.finished);
            snapshot.record(Event::Built);
            snapshot.record(Event::Built);
            assert_eq!(
                snapshot.json(),
                r#"{"version":1,"built":true,"committed":true,"finished":true,"navigation_denied":false,"load_failed":false,"termination":"none"}"#
            );
        }
    }

    #[test]
    fn first_observed_termination_including_unknown_never_resets() {
        for first in [
            Termination::Crashed,
            Termination::MemoryLimit,
            Termination::ApiTerminated,
            Termination::Unknown,
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.record(Event::Terminated(first));
            for later in [
                Termination::None,
                Termination::Crashed,
                Termination::MemoryLimit,
                Termination::ApiTerminated,
                Termination::Unknown,
            ] {
                snapshot.record(Event::Terminated(later));
                snapshot.record(Event::Finished);
                assert_eq!(snapshot.termination, first);
            }
        }
    }

    #[test]
    fn every_possible_serialized_snapshot_is_ascii_and_bounded() {
        let flags = [
            Event::Built,
            Event::Committed,
            Event::Finished,
            Event::NavigationDenied,
            Event::LoadFailed,
        ];
        for bits in 0..32 {
            for termination in [
                Termination::None,
                Termination::Crashed,
                Termination::MemoryLimit,
                Termination::ApiTerminated,
                Termination::Unknown,
            ] {
                let mut snapshot = Snapshot::default();
                for (index, event) in flags.iter().enumerate() {
                    if bits & (1 << index) != 0 {
                        snapshot.record(*event);
                    }
                }
                snapshot.record(Event::Terminated(termination));
                let json = snapshot.json();
                assert!(json.is_ascii() && json.len() <= 256);
                assert_eq!(json.matches(':').count(), 7);
                assert_eq!(json.matches(',').count(), 6);
                assert!(json.ends_with(&format!(r#""termination":"{}"}}"#, termination.label())));
            }
        }
    }
}
