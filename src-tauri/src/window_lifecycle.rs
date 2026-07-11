pub trait WindowActions {
    fn unminimize(&self) -> Result<(), String>;
    fn show(&self) -> Result<(), String>;
    fn focus(&self) -> Result<(), String>;
}

impl<R: tauri::Runtime> WindowActions for tauri::WebviewWindow<R> {
    fn unminimize(&self) -> Result<(), String> { self.unminimize().map_err(|error| error.to_string()) }
    fn show(&self) -> Result<(), String> { self.show().map_err(|error| error.to_string()) }
    fn focus(&self) -> Result<(), String> { self.set_focus().map_err(|error| error.to_string()) }
}

pub fn activate_window(window: &impl WindowActions) {
    if let Err(error) = window.unminimize() { log::warn!("Failed to unminimize main window: {error}"); }
    if let Err(error) = window.show() { log::warn!("Failed to show main window: {error}"); }
    if let Err(error) = window.focus() { log::warn!("Failed to focus main window: {error}"); }
}

#[cfg(test)]
mod tests {
    use super::{activate_window, WindowActions};
    use std::cell::RefCell;

    struct FakeWindow { calls: RefCell<Vec<&'static str>>, fail_unminimize: bool }
    impl WindowActions for FakeWindow {
        fn unminimize(&self) -> Result<(), String> { self.calls.borrow_mut().push("unminimize"); if self.fail_unminimize { Err("failed".into()) } else { Ok(()) } }
        fn show(&self) -> Result<(), String> { self.calls.borrow_mut().push("show"); Ok(()) }
        fn focus(&self) -> Result<(), String> { self.calls.borrow_mut().push("focus"); Ok(()) }
    }

    #[test]
    fn activates_in_visible_focus_order() {
        let window = FakeWindow { calls: RefCell::new(vec![]), fail_unminimize: false };
        activate_window(&window);
        assert_eq!(*window.calls.borrow(), vec!["unminimize", "show", "focus"]);
    }

    #[test]
    fn continues_when_unminimize_fails() {
        let window = FakeWindow { calls: RefCell::new(vec![]), fail_unminimize: true };
        activate_window(&window);
        assert_eq!(*window.calls.borrow(), vec!["unminimize", "show", "focus"]);
    }
}
