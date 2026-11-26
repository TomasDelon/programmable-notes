use gtk::prelude::*;
use std::{cell::RefCell, io::Read, rc::Rc};
use wry::{
    dpi::{LogicalPosition, LogicalSize},
    Rect, WebViewBuilder, WebViewBuilderExtUnix,
};

const FIXTURE: &str = r#"<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-spike'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"></head><body style="margin:0;background:#bbeedd;font:20px sans-serif"><button id="counter">Count: 0</button><input id="field" placeholder="Type here"><p>ACTUAL WRY CHILD</p><script nonce="spike">let count=0;function report(){document.title=JSON.stringify({count,field:document.getElementById('field').value,focus:document.activeElement.id})}document.getElementById('counter').addEventListener('click',()=>{document.getElementById('counter').textContent='Count: '+(++count);report()});document.getElementById('field').addEventListener('input',report);report()</script></body></html>"#;

fn child() -> Result<(), Box<dyn std::error::Error>> {
    let mut payload = String::new();
    std::io::stdin().take(65).read_to_string(&mut payload)?;
    if payload.len() > 64 {
        return Err("oversized trusted parent XID".into());
    }
    let parent: u64 = payload.parse()?;
    gtk::init()?;
    let plug = gtk::Plug::new(parent as _);
    plug.set_default_size(300, 120);
    let _view = WebViewBuilder::new()
        .with_incognito(true)
        .with_devtools(false)
        .with_bounds(Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(300, 120).into(),
        })
        .with_navigation_handler(|url| matches!(url.as_str(), "about:blank"))
        .with_download_started_handler(|_, _| false)
        .with_html(FIXTURE)
        .build_gtk(&plug)?;
    plug.show_all();
    println!(
        "CHILD_READY pid={} trusted_parent={}",
        std::process::id(),
        parent
    );
    gtk::main();
    Ok(())
}

fn host() -> Result<(), Box<dyn std::error::Error>> {
    gtk::init()?;
    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.set_title("Pinned Wry GtkPlug feasibility host");
    window.set_default_size(640, 500);
    let fixed = gtk::Fixed::new();
    window.add(&fixed);
    let editor = gtk::Entry::new();
    editor.set_text("TRUSTED EDITOR INPUT");
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
    println!("HOST_READY pid={} trusted_parent={xid}", std::process::id());
    let unit = supervisor
        .borrow_mut()
        .start(&std::env::current_exe()?, &xid.to_string())?;
    println!("HOST_UNIT {unit}");
    gtk::main();
    supervisor.borrow_mut().stop()?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().any(|arg| arg == "--preview-child") {
        child()
    } else {
        host()
    }
}
