# VeraFlow Test · Focused Workflow

You are viewing the experimental `codex/focused-workflow` branch. The focused interface shows the active field, the next action, and a checklist. Use **Pause** and **Resume task** to keep your place. Choose **Classic view** to switch layouts during a session.

## Install

### Windows x64

1. Sign in to GitHub and open [Check runs for Focused Workflow](https://github.com/iandorsey00/veraflow/actions/workflows/check.yml?query=branch%3Acodex%2Ffocused-workflow).
2. Open the newest successful run with a live `VeraFlow-Windows-Test-<commit>` artifact. Scroll to **Artifacts** on the run summary and download the ZIP.
3. Extract the ZIP and quit any running VeraFlow or VeraFlow Test from the system tray. Run `VeraFlow-Test-<commit>-setup.exe`.
4. Open **VeraFlow Test** from Start. Check the commit in the banner against `BUILD.txt` in the ZIP.

Downloads expire 14 days after upload. If you need a fresh build, use **Run workflow** on the Check page, with `codex/focused-workflow` selected. See the [Windows test guide](docs/windows-testing.md) for download checks and branch switching.

### macOS

Run this branch from source to try the desktop app. You’ll need Node.js 24, Rust, and Xcode Command Line Tools.

```sh
git clone --branch codex/focused-workflow https://github.com/iandorsey00/veraflow.git veraflow-test-focused
cd veraflow-test-focused
npm ci
VITE_TEST_BUILD=1 npm run desktop -- --features test-build --config src-tauri/tauri.test.conf.json
```

The desktop command launches **VeraFlow Test**. For a browser preview, run `npm run dev` after `npm ci` and open the local URL printed in the terminal.

## Use this branch

Read the [trial guide](docs/focused-workflow.md) for the walkthrough and tips for switching views. VeraFlow Test uses a shared test library across trial branches. Regular VeraFlow has its own library.

For public VeraFlow installation and general product documentation, see the [main branch README](https://github.com/iandorsey00/veraflow/tree/main#install-the-public-preview).
