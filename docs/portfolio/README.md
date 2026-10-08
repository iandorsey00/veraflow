# Portfolio scenes

Start `npm run dev`, then run `npm run portfolio:capture` (requires Playwright Chromium). `PORTFOLIO_URL` may point to a different loopback preview; remote URLs are rejected. Each capture begins with a fresh isolated browser context and synthetic templates. There are no production credentials or session files to seed or reset. Closing the browser erases the fixtures.

| Image                          | Purpose / alt text                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `01-template-library.png`      | VeraFlow template editor, unique placeholder fields, and capture order.                           |
| `02-verification-mismatch.png` | Compact verification panel with green verified fields and a PR-104/PR-1O4 mismatch. |
| `03-chinese-dark.png`          | Simplified Chinese template editing with system-independent dark appearance.                      |

`04-email-template.png` shows opt-in Subject/To/Body templates with Cc enabled and Bcc disabled, using synthetic project fields.

The editor uses the shared 1440 × 1000 baseline at 2×; the floating panel uses 440px width to represent its actual workflow. These are browser UI previews (the banner says so), not evidence of native hotkey operation. PNGs are curated documentation, not regression baselines. Refresh after substantive UI changes and review every visible value before publishing.
