//! Fixed GtkSocket/Plug diagnostic, not the product or a document-authority service.
#[cfg(not(target_os = "linux"))]
compile_error!("The fixed inline diagnostic requires Linux/X11");

use gtk::prelude::*;
use std::{cell::RefCell, io::Read, rc::Rc};
use wry::{
    dpi::{LogicalPosition, LogicalSize},
    Rect, WebViewBuilder, WebViewBuilderExtUnix,
};

const FIXTURE: &str = include_str!(concat!(env!("OUT_DIR"), "/fixture.html"));
static BUILD_EVIDENCE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/fixture-evidence.bin"));
const REJECTED_TITLE: &[u8] =
    br#"{"fixture":"inline-react-v1","ready":false,"error":"receipt-overflow"}"#;

fn child() -> Result<(), Box<dyn std::error::Error>> {
    let mut payload = String::new();
    std::io::stdin().take(65).read_to_string(&mut payload)?;
    if payload.is_empty()
        || payload.len() > 64
        || !payload.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("Invalid trusted parent XID".into());
    }
    let parent: u64 = payload.parse()?;
    if parent == 0 {
        return Err("Invalid trusted parent XID".into());
    }
    gtk::init()?;
    let plug = gtk::Plug::new(parent as _);
    plug.set_default_size(300, 120);
    plug.realize();
    let receipt_window = plug.window().ok_or("Own Plug native window missing")?;
    let receipt_atom = gtk::gdk::Atom::intern("_PN_FIXTURE_STATE");
    let bridge_atom = gtk::gdk::Atom::intern("_PN_FIXTURE_BRIDGE");
    let utf8_atom = gtk::gdk::Atom::intern("UTF8_STRING");
    // This independent sentinel persists even if React updates STATE before observation.
    gtk::gdk::property_change(
        &receipt_window,
        &bridge_atom,
        &utf8_atom,
        8,
        gtk::gdk::PropMode::Replace,
        gtk::gdk::ChangeData::UChars(br#"{"bridge":"native-before-webkit"}"#),
    );
    gtk::gdk::property_change(
        &receipt_window,
        &receipt_atom,
        &utf8_atom,
        8,
        gtk::gdk::PropMode::Replace,
        gtk::gdk::ChangeData::UChars(br#"{"bridge":"native-before-webkit"}"#),
    );
    receipt_window.display().flush();
    let _view = WebViewBuilder::new()
        .with_incognito(true)
        .with_devtools(false)
        .with_bounds(Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(300, 120).into(),
        })
        .with_navigation_handler(|url| matches!(url.as_str(), "about:blank"))
        .with_download_started_handler(|_, _| false)
        .with_document_title_changed_handler(move |title| {
            // An empty initial title must not erase the independent native sentinel.
            if title.is_empty() {
                return;
            }
            let diagnostic = if title.len() <= 256 {
                title.as_bytes()
            } else {
                REJECTED_TITLE
            };
            // Untrusted diagnostic data is written only to this child's own window.
            // It never selects a command, source mutation, file or supervisor action.
            gtk::gdk::property_change(
                &receipt_window,
                &receipt_atom,
                &utf8_atom,
                8,
                gtk::gdk::PropMode::Replace,
                gtk::gdk::ChangeData::UChars(diagnostic),
            );
            receipt_window.display().flush();
        })
        .with_html(FIXTURE)
        .build_gtk(&plug)?;
    plug.show_all();
    println!(
        "CHILD_READY pid={} trusted_parent={parent}",
        std::process::id()
    );
    gtk::main();
    Ok(())
}

fn host() -> Result<(), Box<dyn std::error::Error>> {
    gtk::init()?;
    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.set_title("Fixed inline React v1 diagnostic");
    window.set_default_size(640, 500);
    let fixed = gtk::Fixed::new();
    window.add(&fixed);
    let editor = gtk::Entry::new();
    editor.set_text("TRUSTED EDITOR INPUT");
    editor.connect_changed(|entry| {
        let bounded: String = entry.text().chars().take(100).collect();
        println!("HOST_ENTRY {bounded}");
    });
    fixed.put(&editor, 20, 10);
    let viewport = gtk::Socket::new();
    viewport.set_size_request(300, 120);
    fixed.put(&viewport, 20, 70);
    let below = gtk::Label::new(Some("TRUSTED TEXT BELOW; child must clip at 300 x 120"));
    fixed.put(&below, 20, 210);
    let supervisor = Rc::new(RefCell::new(preview_policy::Supervisor::default()));
    let stop = gtk::Button::with_label("Stop child");
    fixed.put(&stop, 20, 260);
    let button_supervisor = supervisor.clone();
    stop.connect_clicked(move |_| {
        println!(
            "HOST_BUTTON_STOP {:?}",
            button_supervisor.borrow_mut().stop()
        )
    });
    let close_supervisor = supervisor.clone();
    window.connect_delete_event(move |_, _| {
        println!("HOST_CLOSE_STOP {:?}", close_supervisor.borrow_mut().stop());
        gtk::main_quit();
        gtk::glib::Propagation::Proceed
    });
    window.show_all();
    let xid = viewport.id();
    let host_xid = window
        .window()
        .ok_or("Host native window missing")?
        .dynamic_cast::<gdkx11::X11Window>()
        .map_err(|_| "Host is not X11")?
        .xid();
    println!(
        "HOST_READY pid={} trusted_parent={xid} host_xid={host_xid}",
        std::process::id()
    );
    let unit = supervisor
        .borrow_mut()
        .start(&std::env::current_exe()?, &xid.to_string())?;
    println!("HOST_UNIT {unit}");
    gtk::main();
    supervisor.borrow_mut().stop()?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Public immutable build provenance only; inspection needs no native execution.
    std::hint::black_box(BUILD_EVIDENCE);
    // This fixed guest profile has no root or owner-desktop mode.
    if unsafe { libc::getuid() } != 1001 || unsafe { libc::geteuid() } != 1001 {
        return Err("Fixed diagnostic requires fixture UID 1001".into());
    }
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    match arguments.as_slice() {
        [] => host(),
        [argument] if argument == "--preview-child" => child(),
        _ => Err("Fixed diagnostic accepts no caller payload or options".into()),
    }
}
