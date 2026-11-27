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
    GuardsInstalled,
    PublicationRequested,
    PublicationReturned,
    ProvisionalStarted,
    Committed,
    Finished,
    NavigationDenied,
    LoadFailed,
    Terminated(Termination),
}

#[derive(Default)]
pub(crate) struct Snapshot {
    built: bool,
    guards_installed: bool,
    publication_requested: bool,
    publication_returned: bool,
    provisional_started: bool,
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
            Event::GuardsInstalled => self.guards_installed = true,
            Event::PublicationRequested => self.publication_requested = true,
            Event::PublicationReturned => self.publication_returned = true,
            Event::ProvisionalStarted => self.provisional_started = true,
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
            "{{\"version\":2,\"built\":{},\"guards_installed\":{},\"publication_requested\":{},\"publication_returned\":{},\"provisional_started\":{},\"committed\":{},\"finished\":{},\"navigation_denied\":{},\"load_failed\":{},\"termination\":\"{}\"}}",
            self.built, self.guards_installed, self.publication_requested,
            self.publication_returned, self.provisional_started, self.committed, self.finished, self.navigation_denied,
            self.load_failed, self.termination.label()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_snapshot_has_only_the_eleven_fixed_fields() {
        assert_eq!(
            Snapshot::default().json(),
            r#"{"version":2,"built":false,"guards_installed":false,"publication_requested":false,"publication_returned":false,"provisional_started":false,"committed":false,"finished":false,"navigation_denied":false,"load_failed":false,"termination":"none"}"#
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
                r#"{"version":2,"built":true,"guards_installed":false,"publication_requested":false,"publication_returned":false,"provisional_started":false,"committed":true,"finished":true,"navigation_denied":false,"load_failed":false,"termination":"none"}"#
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
    fn startup_observations_are_independent_and_sticky_without_inferred_milestones() {
        for (event, field) in [
            (Event::GuardsInstalled, "guards_installed"),
            (Event::PublicationRequested, "publication_requested"),
            (Event::PublicationReturned, "publication_returned"),
            (Event::ProvisionalStarted, "provisional_started"),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.record(event);
            let first = snapshot.json();
            assert!(first.contains(&format!("\"{field}\":true")));
            assert_eq!(first.matches(":true").count(), 1);
            assert!(!snapshot.built && !snapshot.committed && !snapshot.finished);
            snapshot.record(event);
            assert_eq!(snapshot.json(), first);
        }
        let mut snapshot = Snapshot::default();
        snapshot.record(Event::ProvisionalStarted);
        snapshot.record(Event::Committed);
        snapshot.record(Event::Finished);
        assert!(!snapshot.publication_returned);
        snapshot.record(Event::PublicationReturned);
        assert!(snapshot.provisional_started && snapshot.committed && snapshot.finished);
        assert!(!snapshot.publication_requested && !snapshot.guards_installed);
    }

    #[test]
    fn every_possible_serialized_snapshot_is_ascii_and_bounded() {
        let flags = [
            Event::Built,
            Event::GuardsInstalled,
            Event::PublicationRequested,
            Event::PublicationReturned,
            Event::ProvisionalStarted,
            Event::Committed,
            Event::Finished,
            Event::NavigationDenied,
            Event::LoadFailed,
        ];
        let mut maximum = 0;
        for bits in 0..(1 << flags.len()) {
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
                maximum = maximum.max(json.len());
                assert!(json.is_ascii() && json.len() <= 256);
                assert_eq!(json.matches(':').count(), 11);
                assert_eq!(json.matches(',').count(), 10);
                assert!(json.ends_with(&format!(r#""termination":"{}"}}"#, termination.label())));
            }
        }
        assert_eq!(maximum, 251);
    }
}
