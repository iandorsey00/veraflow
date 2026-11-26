// Source-checkout PDF bridge. It never initializes the Tauri runtime.
#[cfg(target_os = "macos")]
#[path = "../src/pdf/converter.rs"]
mod converter;

#[cfg(target_os = "macos")]
mod headless {
    use crate::converter::{read_settings, Destination, Tools, MARKDOWN_LIMIT};
    use std::{
        env,
        io::{self, Read},
        path::PathBuf,
        sync::atomic::{AtomicBool, Ordering},
    };

    static CANCELLED: AtomicBool = AtomicBool::new(false);

    extern "C" fn cancel(_: i32) {
        CANCELLED.store(true, Ordering::Release);
    }

    fn tools() -> Result<Tools, &'static str> {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .map_err(|_| "storageFailed")?;
        let identifier = config["identifier"].as_str().ok_or("storageFailed")?;
        let saved = match env::var_os("HOME") {
            Some(home) => read_settings(
                &PathBuf::from(home)
                    .join("Library/Application Support")
                    .join(identifier)
                    .join("pdf-tools.json"),
            )?,
            None => Tools::default(),
        };
        Ok(saved.discover().0)
    }

    pub fn run() -> Result<(), &'static str> {
        let mut args = env::args_os().skip(1);
        let path = args.next().ok_or("pdfDestination")?;
        let replace = match args.next() {
            None => false,
            Some(flag) if flag == "--force" && args.next().is_none() => true,
            _ => return Err("pdfDestination"),
        };
        let destination = Destination::new(path.into(), replace)?;
        unsafe extern "C" {
            fn signal(sig: i32, handler: extern "C" fn(i32)) -> usize;
        }
        // The converter starts its own process group. Let the shared runner clean it up
        // when a terminal interrupts the CLI instead of exiting immediately.
        unsafe {
            signal(2, cancel);
            signal(15, cancel);
        }
        let mut markdown = String::new();
        io::stdin()
            .take((MARKDOWN_LIMIT + 1) as u64)
            .read_to_string(&mut markdown)
            .map_err(|_| "pdfMarkdownLimit")?;
        destination.save(&markdown, &tools()?, &CANCELLED)
    }
}

fn main() -> std::process::ExitCode {
    #[cfg(target_os = "macos")]
    let result = headless::run();
    #[cfg(not(target_os = "macos"))]
    let result: Result<(), &str> = Err("pdfPlatform");
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::FAILURE
        }
    }
}
