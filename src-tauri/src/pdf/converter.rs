use serde::{Deserialize, Serialize};
use std::{
    ffi::{OsStr, OsString},
    fs::{self, File, Metadata, Permissions},
    io::{self, Read, Seek, SeekFrom, Write},
    os::unix::{
        fs::{MetadataExt, PermissionsExt},
        process::CommandExt,
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

pub(super) const MARKDOWN_LIMIT: usize = 16 * 1024 * 1024;
const PDF_LIMIT: u64 = 128 * 1024 * 1024;
const DIAGNOSTICS_LIMIT: usize = 16 * 1024;
const CONVERSION_TIMEOUT: Duration = Duration::from_secs(90);
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    Pandoc,
    Xelatex,
}
impl Tool {
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Pandoc => "pandoc",
            Self::Xelatex => "xelatex",
        }
    }

    pub(super) fn missing(self) -> &'static str {
        match self {
            Self::Pandoc => "pdfPandocMissing",
            Self::Xelatex => "pdfEngineMissing",
        }
    }

    pub(super) fn candidates(self) -> &'static [&'static str] {
        match self {
            Self::Pandoc => &[
                "/opt/homebrew/bin/pandoc",
                "/usr/local/bin/pandoc",
                "/opt/local/bin/pandoc",
            ],
            Self::Xelatex => &[
                "/Library/TeX/texbin/xelatex",
                "/opt/homebrew/bin/xelatex",
                "/usr/local/bin/xelatex",
                "/opt/local/bin/xelatex",
            ],
        }
    }

    pub(super) fn path(self, tools: &mut Tools) -> &mut Option<PathBuf> {
        match self {
            Self::Pandoc => &mut tools.pandoc,
            Self::Xelatex => &mut tools.xelatex,
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Tools {
    pub(super) pandoc: Option<PathBuf>,
    pub(super) xelatex: Option<PathBuf>,
}

impl Tools {
    pub(super) fn discover(mut self) -> (Self, bool) {
        let mut configured = true;
        for tool in [Tool::Pandoc, Tool::Xelatex] {
            let slot = tool.path(&mut self);
            if !slot.as_deref().is_some_and(|path| verify_tool(path, tool)) {
                configured = false;
                *slot = tool
                    .candidates()
                    .iter()
                    .map(Path::new)
                    .find(|path| verify_tool(path, tool))
                    .map(Path::to_owned);
            }
        }
        (self, configured)
    }

    pub(super) fn executables(&self) -> Result<(&Path, &Path), &'static str> {
        let pandoc = self
            .pandoc
            .as_deref()
            .filter(|path| executable(path, Tool::Pandoc))
            .ok_or(Tool::Pandoc.missing())?;
        let xelatex = self
            .xelatex
            .as_deref()
            .filter(|path| executable(path, Tool::Xelatex))
            .ok_or(Tool::Xelatex.missing())?;
        Ok((pandoc, xelatex))
    }
}

pub(super) fn read_settings(path: &Path) -> Result<Tools, &'static str> {
    match File::open(path) {
        Ok(file) => serde_json::from_reader(file.take(32 * 1024)).map_err(|_| "storageFailed"),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Tools::default()),
        Err(_) => Err("storageFailed"),
    }
}

pub(super) fn executable(path: &Path, tool: Tool) -> bool {
    // Preserve the selected alias. XeTeX chooses its format from argv[0].
    path.is_absolute()
        && path.file_name() == Some(OsStr::new(tool.name()))
        && fs::metadata(path)
            .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

fn kill_group(child: &mut Child) {
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    // The child is its own process group. A negative PID also addresses its descendants.
    unsafe { kill(-(child.id() as i32), 9) };
    let _ = child.wait();
}

fn drain(mut pipe: impl Read) -> Vec<u8> {
    let mut retained = Vec::new();
    let mut chunk = [0; 4096];
    while let Ok(size @ 1..) = pipe.read(&mut chunk) {
        let keep = size.min(DIAGNOSTICS_LIMIT - retained.len());
        retained.extend_from_slice(&chunk[..keep]);
    }
    retained
}

fn run(
    command: &mut Command,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<(bool, Vec<u8>, Vec<u8>), &'static str> {
    let mut child = command
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "pdfConvertFailed")?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let stdout = thread::spawn(move || drain(stdout));
    let stderr = thread::spawn(move || drain(stderr));
    let start = Instant::now();
    let outcome = loop {
        if cancelled.load(Ordering::Acquire) {
            break Err("pdfCancelled");
        }
        if start.elapsed() >= timeout {
            break Err("pdfTimedOut");
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status.success()),
            Ok(None) => thread::sleep(Duration::from_millis(35)),
            Err(_) => break Err("pdfConvertFailed"),
        }
    };
    kill_group(&mut child);
    let stdout = stdout.join().unwrap_or_default();
    let stderr = stderr.join().unwrap_or_default();
    outcome.map(|success| (success, stdout, stderr))
}

pub(super) fn verify_tool(path: &Path, tool: Tool) -> bool {
    if !executable(path, tool) {
        return false;
    }
    // Do not run a version probe from the user's document directory.
    let probe = run(
        Command::new(path).current_dir("/").arg("--version"),
        Duration::from_secs(3),
        &AtomicBool::new(false),
    );
    let Ok((true, bytes, _)) = probe else {
        return false;
    };
    let output = String::from_utf8_lossy(&bytes);
    match tool {
        Tool::Pandoc => output.starts_with("pandoc "),
        Tool::Xelatex => output.starts_with("XeTeX "),
    }
}

fn pandoc_args(xelatex: &Path) -> [OsString; 8] {
    // Paths are operands, and neither Markdown nor metadata becomes a command-line option.
    let mut engine = OsString::from("--pdf-engine=");
    engine.push(xelatex);
    [
        "input.md".into(),
        "--from=markdown".into(),
        "--sandbox".into(),
        "--data-dir=.".into(),
        engine,
        "--pdf-engine-opt=-no-shell-escape".into(),
        "-o".into(),
        "output.pdf".into(),
    ]
}

fn checked_destination(path: &Path) -> Result<Option<Metadata>, &'static str> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Err("pdfDestination");
    }
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() => Ok(Some(meta)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        _ => Err("pdfDestination"),
    }
}

pub(super) struct Destination {
    path: PathBuf,
    before: Option<Metadata>,
}

impl Destination {
    pub(super) fn new(path: PathBuf, replace: bool) -> Result<Self, &'static str> {
        let before = checked_destination(&path)?;
        if before.is_some() && !replace {
            return Err("pdfDestinationExists");
        }
        Ok(Self { path, before })
    }

    pub(super) fn save(
        self,
        markdown: &str,
        tools: &Tools,
        cancelled: &AtomicBool,
    ) -> Result<(), &'static str> {
        if markdown.is_empty() || markdown.len() > MARKDOWN_LIMIT {
            return Err("pdfMarkdownLimit");
        }
        let (pandoc, xelatex) = tools.executables()?;
        convert(
            markdown,
            pandoc,
            xelatex,
            &self.path,
            self.before,
            cancelled,
        )
    }
}

fn readable_pdf(path: &Path) -> io::Result<File> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || !(64..=PDF_LIMIT).contains(&metadata.len()) {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut file = File::open(path)?;
    let mut header = [0; 8];
    file.read_exact(&mut header)?;
    let tail_size = metadata.len().min(4096) as i64;
    file.seek(SeekFrom::End(-tail_size))?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail)?;
    let trimmed = tail.trim_ascii_end();
    let xref = trimmed.strip_suffix(b"%%EOF").and_then(|tail| {
        let marker = tail.windows(9).rposition(|bytes| bytes == b"startxref")?;
        std::str::from_utf8(tail[marker + 9..].trim_ascii())
            .ok()?
            .parse::<u64>()
            .ok()
    });
    let Some(offset) = xref.filter(|&offset| (8..metadata.len()).contains(&offset)) else {
        return Err(io::ErrorKind::InvalidData.into());
    };
    file.seek(SeekFrom::Start(offset))?;
    let mut table = Vec::new();
    (&mut file).take(4096).read_to_end(&mut table)?;
    if !header.starts_with(b"%PDF-")
        || !(table.starts_with(b"xref") || table.windows(5).any(|bytes| bytes == b"/XRef"))
    {
        return Err(io::ErrorKind::InvalidData.into());
    }
    file.rewind()?;
    Ok(file)
}

fn publish_pdf(
    mut pdf: File,
    destination: &Path,
    before: Option<Metadata>,
    cancelled: &AtomicBool,
) -> Result<(), &'static str> {
    let dir = destination.parent().ok_or("pdfDestination")?;
    let mut staged = tempfile::NamedTempFile::new_in(dir).map_err(|_| "pdfDestination")?;
    io::copy(&mut pdf, &mut staged).map_err(|_| "pdfDestination")?;
    staged.as_file().sync_all().map_err(|_| "pdfDestination")?;
    if cancelled.load(Ordering::Acquire) {
        return Err("pdfCancelled");
    }
    if let Some(previous) = before {
        let current = checked_destination(destination)?.ok_or("pdfDestinationChanged")?;
        let fingerprint = |meta: &Metadata| {
            (
                meta.dev(),
                meta.ino(),
                meta.len(),
                meta.ctime(),
                meta.ctime_nsec(),
            )
        };
        if fingerprint(&previous) != fingerprint(&current) {
            return Err("pdfDestinationChanged");
        }
        staged.persist(destination).map_err(|_| "pdfDestination")?;
    } else {
        staged.persist_noclobber(destination).map_err(|error| {
            if error.error.kind() == io::ErrorKind::AlreadyExists {
                "pdfDestinationChanged"
            } else {
                "pdfDestination"
            }
        })?;
    }
    Ok(())
}

fn convert(
    markdown: &str,
    pandoc: &Path,
    xelatex: &Path,
    destination: &Path,
    before: Option<Metadata>,
    cancelled: &AtomicBool,
) -> Result<(), &'static str> {
    let temp = tempfile::Builder::new()
        .prefix("veraflow-pdf-")
        .permissions(Permissions::from_mode(0o700))
        .tempdir()
        .map_err(|_| "pdfConvertFailed")?;
    let dir = &temp.path().canonicalize().map_err(|_| "pdfConvertFailed")?;
    File::create(dir.join("input.md"))
        .and_then(|mut file| file.write_all(markdown.as_bytes()))
        .map_err(|_| "pdfConvertFailed")?;
    // Pandoc's reader sandbox does not cover media fetches during PDF production.
    // The OS profile keeps the converter and its children offline and all writes in the job directory.
    let mut command = Command::new("/usr/bin/sandbox-exec");
    command
        .current_dir(dir)
        .env("TMPDIR", dir)
        .args(["-p", "(version 1) (allow default) (deny network*) (deny file-write* (require-not (subpath (param \"WORK_DIR\"))))", "-D"])
        .arg({
            let mut parameter = OsString::from("WORK_DIR=");
            parameter.push(dir);
            parameter
        })
        .arg(pandoc)
        .args(pandoc_args(xelatex));
    let (success, _, diagnostics) = run(&mut command, CONVERSION_TIMEOUT, cancelled)?;
    if !success {
        // Classify a few common failures without keeping document text in persistent diagnostics.
        let error = String::from_utf8_lossy(&diagnostics);
        return Err(
            if error.contains("fontspec") || error.contains("font cannot be found") {
                "pdfFontFailed"
            } else if error.contains("File `") && error.contains(".sty") {
                "pdfLatexPackage"
            } else {
                "pdfConvertFailed"
            },
        );
    }
    let pdf = readable_pdf(&dir.join("output.pdf")).map_err(|_| "pdfInvalidResult")?;
    publish_pdf(pdf, destination, before, cancelled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converter_arguments_keep_paths_and_shell_escape_under_app_control() {
        let args = pandoc_args(Path::new("/工具 With Spaces/xelatex"));
        assert_eq!(args[0], "input.md");
        assert_eq!(args[4], "--pdf-engine=/工具 With Spaces/xelatex");
        assert_eq!(args[5], "--pdf-engine-opt=-no-shell-escape");
        assert_eq!(args[7], "output.pdf");
    }

    #[test]
    fn broken_pdf_and_concurrent_destination_fail_without_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let broken = dir.path().join("partial.pdf");
        fs::write(&broken, b"%PDF-1.7\nIncomplete output").unwrap();
        assert!(readable_pdf(&broken).is_err());

        let source = dir.path().join("source");
        fs::write(&source, b"complete content").unwrap();
        let destination = dir.path().join("现有 document.pdf");
        let cancelled = AtomicBool::new(false);
        fs::write(&destination, b"existing file").unwrap();
        assert_eq!(
            publish_pdf(File::open(&source).unwrap(), &destination, None, &cancelled),
            Err("pdfDestinationChanged")
        );
        assert_eq!(fs::read(&destination).unwrap(), b"existing file");
        let before = checked_destination(&destination).unwrap();
        fs::write(&destination, b"newer existing file").unwrap();
        assert_eq!(
            publish_pdf(
                File::open(&source).unwrap(),
                &destination,
                before,
                &cancelled
            ),
            Err("pdfDestinationChanged")
        );
        assert_eq!(fs::read(&destination).unwrap(), b"newer existing file");
        assert_eq!(
            publish_pdf(
                File::open(&source).unwrap(),
                &dir.path().join("missing/out.pdf"),
                None,
                &cancelled
            ),
            Err("pdfDestination")
        );
    }

    #[test]
    fn cancellation_and_timeout_stop_the_converter_process_group() {
        let result = run(
            Command::new("/bin/sh").args(["-c", "/bin/sleep 60 & wait"]),
            Duration::from_millis(100),
            &AtomicBool::new(false),
        );
        assert_eq!(result.unwrap_err(), "pdfTimedOut");
        let result = run(
            Command::new("/bin/sh").args(["-c", "/bin/sleep 60 & wait"]),
            Duration::from_secs(2),
            &AtomicBool::new(true),
        );
        assert_eq!(result.unwrap_err(), "pdfCancelled");
    }

    // Exercise the actual converter when the developer has installed both tools.
    #[test]
    #[ignore = "requires Pandoc, XeLaTeX, and example Markdown from the renderer"]
    fn installed_tools_convert_examples_and_preserve_an_existing_pdf_on_failure() {
        let examples = PathBuf::from(std::env::var_os("VERAFLOW_PDF_FIXTURES").unwrap());
        let pandoc = Tool::Pandoc
            .candidates()
            .iter()
            .map(Path::new)
            .find(|path| verify_tool(path, Tool::Pandoc))
            .unwrap();
        let xelatex = Tool::Xelatex
            .candidates()
            .iter()
            .map(Path::new)
            .find(|path| verify_tool(path, Tool::Xelatex))
            .unwrap();
        let paths = tempfile::Builder::new()
            .prefix("转换工具 with spaces ")
            .tempdir_in(&examples)
            .unwrap();
        let pandoc_alias = paths.path().join("pandoc");
        let engine_alias = paths.path().join("xelatex");
        std::os::unix::fs::symlink(pandoc, &pandoc_alias).unwrap();
        std::os::unix::fs::symlink(xelatex, &engine_alias).unwrap();
        let cancelled = AtomicBool::new(false);
        for name in ["resume", "dispatch"] {
            let md = fs::read_to_string(examples.join(format!("{name}.md"))).unwrap();
            let pdf = examples.join(format!("{name} 样例.pdf"));
            convert(
                &md,
                &pandoc_alias,
                &engine_alias,
                &pdf,
                checked_destination(&pdf).unwrap(),
                &cancelled,
            )
            .unwrap();
            let original = fs::read(&pdf).unwrap();
            let broken = "---\nmainfont: AFontThatDoesNotExist\n---\n\nTest";
            assert_eq!(
                convert(
                    broken,
                    &pandoc_alias,
                    &engine_alias,
                    &pdf,
                    checked_destination(&pdf).unwrap(),
                    &cancelled
                ),
                Err("pdfFontFailed")
            );
            assert_eq!(fs::read(&pdf).unwrap(), original);
        }
    }
}
