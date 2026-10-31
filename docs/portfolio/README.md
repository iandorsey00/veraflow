# Portfolio scenes

Start `npm run dev`, then run `npm run portfolio:capture` (requires Playwright Chromium). `PORTFOLIO_URL` may point to a different loopback preview; remote URLs are rejected. Each capture begins with a fresh isolated browser context and synthetic templates. There are no production credentials or session files to seed or reset. Closing the browser erases the fixtures.

| Image                          | Purpose / alt text                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `01-template-library.png`      | VeraFlow template editor, unique placeholder fields, and capture order.             |
| `02-verification-mismatch.png` | Compact verification panel with green verified fields and a PR-104/PR-1O4 mismatch. |
| `03-chinese-dark.png`          | Simplified Chinese template editing with system-independent dark appearance.        |

`04-email-template.png` shows opt-in Subject/To/Body templates with Cc enabled and Bcc disabled, using synthetic project fields.

The editor uses the shared 1440 × 1000 baseline at 2×; the floating panel uses 440px width to represent its actual workflow. These are browser UI previews (the banner says so), not evidence of native hotkey operation. PNGs are curated documentation, not regression baselines. Refresh after substantive UI changes and review every visible value before publishing.

`05-email-delivery.png` shows synthetic To → Cc → Body output with Subject excluded, plus manual navigation and keyboard hints. The email editor scene uses a taller 1440 × 2300 viewport to include the new paste-order controls; delivery uses the compact 440px width.

`06-scanner.png` shows standalone selected-text Scanner with a synthetic verified reference, manual entry, and individual-field output. It uses the compact 360px viewport with bottom field actions and one flat More tools panel. This is a browser preview, not native capture evidence.

The October 20 scenes show Workspace as the opening page, a bottom Free Scanner action, generic brace/email defaults, and bottom Scanner actions. `07-workspace.png` shows a synthetic travel row with stable IDs. Existing custom templates and legacy syntax are not rewritten.

The 0.7.1 email-template scene includes synthetic extra Scanner field definitions (booking reference and contact phone) that do not appear in the Body or email headers. The capture script removes these definitions before the independent delivery scene.

`08-table-snippets.png` shows titled synthetic travel messages inside a table with literal-text transfer controls and selected-card keyboard hints. `09-unfiled-snippets.png` shows a titled reusable acknowledgement without a table. Clipboard transfer/source-window paste are not executed by the capture script; these remain browser previews.

`10-focused-scanner.png` documents the experimental focused workflow: one active reference, captured/matched counts, and a compact three-field checklist. Regenerate only this scene with `node scripts/capture-focused.mjs` while the loopback browser preview runs. The script uses fresh synthetic data, requests no clipboard/native transfer, and reads no saved desktop library. The original nine-scene script explicitly uses Classic view so its scenarios continue to document the retained layout.
