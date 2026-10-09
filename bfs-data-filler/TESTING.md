# Testing the BFS Test Data Filler

This guide covers how the extension is tested: automated unit and end-to-end tests, a manual checklist for a release, exploratory charters, and how to record the demo.

| Level | Tool | What it proves | Command |
|---|---|---|---|
| Unit | `node:test` | Checksums match published examples; every generated value obeys (or, for invalid data, breaks) its rule; fields are classified correctly | `npm test` |
| End-to-end | Playwright + Chromium with the extension loaded | The real extension finds, fills, highlights and restores fields in real pages, and the sample app accepts or rejects the data as expected | `npm run test:e2e` |
| Manual | Checklist below | Things automation does not cover well: toolbar icon, permissions prompts, keyboard shortcut, dark mode | Load unpacked |
| Exploratory | Charters below | How it behaves on forms nobody wrote a test for | Load unpacked |

## Run the automated tests

Requirements: Node.js 18 or later.

```bash
npm install
npx playwright install chromium   # once, if Chromium for Playwright is not installed yet
npm test                          # unit tests (about 1 second)
npm run test:e2e                  # end-to-end tests (about 20 seconds)
```

`npm run test:e2e` starts two servers by itself: the sample credit card app from `sample-app/` on port 4318 (with no artificial latency), and the fixture pages in `e2e/fixtures` on port 4319. Set `HEADED=1` to watch the browser. A failing test leaves a trace in `test-results/`; open it with `npx playwright show-trace <path>`. The HTML report is in `playwright-report/`.

### Unit tests (`test/`)

- **`checksums.test.js`**: each algorithm against published values: the Luhn test card `4111 1111 1111 1111`, the Verhoeff example `236 → 3`, the IBANs `GB82 WEST 1234 5698 7654 32` and `DE89 3704 0044 0532 0130 00`, the routing numbers `011000015` and `021000021`, the GSTIN `27AAPFU0939F1ZV`, plus SSN, PAN, IFSC, BIC, NI number and UPI format rules.
- **`generators.test.js`**: property tests. For 200 seeds in each of the 3 regions, every valid value passes its rule. Every boundary case still passes its rule and has a note. Every invalid case fails its rule and has a note (the one exception is the voided "wallet" SSN, which no format rule can catch). Also: the date-of-birth edges are exact for a fixed date, number and date inputs only receive values they accept, `min`/`max`/`maxlength` are respected for valid data and deliberately exceeded for invalid data, the same seed gives the same value, and the persona is consistent.
- **`classifier.test.js`**: every field of the sample app, the India and UK fixtures and common card fields map to the right type; words like "reference" rule out "amount"; the region affects ambiguous labels such as "PAN".

### End-to-end tests (`e2e/`)

`e2e/extension.js` launches Chromium with the unpacked extension and opens the side panel as a tab pinned to the page under test (`sidepanel.html?tabId=<id>`), because Playwright cannot open Chrome's real side panel. The panel code is the same either way.

| Test | Page | Checks |
|---|---|---|
| detects what each field expects | sample app | All 21 fields found with the right type, including radio groups and the consent box |
| valid data passes the application's validation | sample app | Fill, submit, the result page loads with no errors; the panel then shows no fields and no export buttons |
| invalid data is rejected field by field | sample app | Fill with the Invalid profile, submit, the app shows field errors including the terms checkbox |
| one invalid field among valid ones | sample app | Switch only ZIP code to Invalid: no other value changes, and the app shows exactly one error |
| same seed reproduces, Restore restores | sample app | Fill, Restore (fields empty again), fill again with the same seed: identical values |
| boundary profile explains each edge case | sample app | Credit score is 300 or 850; every row is Boundary and has a note |
| changing a field's type | sample app | Re-typing one field re-fills only that field |
| exports JSON and Markdown evidence | sample app | Seed, region, profile, page title and all 21 fields in the export |
| checksum-valid Indian identifiers | `india-kyc.html` | PAN, Aadhaar, IFSC, GSTIN and UPI pass their checks; mobile, PIN and date formats; loan amount and tenure within the field's min/max; state and consent set |
| shadow DOM, iframe and framework state | `uk-payee.html` | NI number, IBAN, BIC, sort code, account, country; the web component field; the card fields in the iframe (Luhn, MM/YY, CVV); the page's controlled-input store received every value |
| Restore brings back a prefilled value | `uk-payee.html` | A field that had a value before filling gets it back |
| context menu path reports to the badge | sample app | The background code used by the right-click menu and Alt+Shift+F fills 21 fields and shows 21 on the badge |
| side panel fits a narrow width | sample app | No sideways scrolling at 300 and 360 pixels wide |
| generate tab produces values with notes | Generate tab | Six invalid IBANs, none of which pass mod-97 |

## Manual test checklist

Run this before sharing a new version. Load the extension unpacked (`chrome://extensions` → Developer mode → Load unpacked → the `bfs-data-filler` folder) and start the sample app (`cd sample-app && npm start`, http://localhost:3000).

| # | Steps | Expected |
|---|---|---|
| M1 | Install the extension | The welcome page opens; **Open the side panel** opens the panel |
| M2 | Open the sample app and click the toolbar icon | The side panel opens and lists 21 fields with types and confidence dots |
| M3 | Click **Fill page** | Fields are filled and outlined green; each row shows its value; the summary shows the seed |
| M4 | Submit the form | The result page loads; the panel says there are no form fields on this page |
| M5 | Go back, fill again, set **Social Security Number** to *Invalid*, submit | Only the SSN shows an error; the panel note says which rule was broken |
| M6 | Click ↻ on one row | Only that field gets a new value |
| M7 | Type a seed, tick **Keep**, close and reopen the panel, fill | The same seed is still set and gives the same data |
| M8 | Click **Restore** | Values go back to what the page had before filling, and the outlines disappear |
| M9 | Switch to **Boundary**, then **Invalid**, and fill | Amber and red outlines; every row has a note |
| M10 | Switch region to **India** and open `e2e/fixtures/india-kyc.html` through the fixture server (`node e2e/fixtures-server.js`, http://127.0.0.1:4319/india-kyc.html) | PAN, Aadhaar, IFSC, GSTIN and UPI are detected and filled |
| M11 | Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> on a form | The page is filled with valid data; the badge shows the number of fields; the open panel updates |
| M12 | Right-click the page → **BFS Test Data Filler** → *Fill page with invalid data* | The page is filled with invalid data |
| M13 | Open an https site you have not allowed (any public form) with the panel open | The panel explains it has no access; clicking the toolbar icon or **Allow on all sites** then **Retry** makes it work |
| M14 | Open `chrome://settings` with the panel open | The panel says Chrome does not allow extensions on that page |
| M15 | Click **Copy JSON** and **Copy Markdown**, paste into a text editor | Valid JSON with page, seed, region, profile and fields; a Markdown table |
| M16 | Generate tab: Card number, Invalid, 10, **Generate** | 10 values, each with a reason; **Copy** copies one value |
| M17 | Switch the operating system to dark mode | The panel and welcome page are readable in dark mode |
| M18 | Drag the side panel to its narrowest width | Nothing is cut off and there is no sideways scrolling |
| M19 | DevTools → Network on the panel (right-click the panel → Inspect) while filling | No network requests |

## Exploratory charters

Use these to look for problems the checklist does not cover. Time-box each to 30 to 45 minutes and note what you find.

1. **Frameworks.** Explore a React, Angular and Vue form (for example a component-library demo page) to discover whether filled values survive blur, validation and submit, and whether the framework's own error messages appear.
2. **Masked inputs.** Explore fields with input masks (phone, card number, date) to discover whether the mask garbles or truncates the generated values. The panel reports when the page changed a value.
3. **Multi-step wizards.** Explore a form spread over several steps to discover whether each step can be filled in turn and whether the seed keeps the applicant consistent from step to step.
4. **Unusual markup.** Explore fields with no label, labels in table cells, `aria-labelledby`, placeholders only, and custom `div` drop-downs to discover what detection gets wrong. Note each wrong type and the label text so the classifier rules can be improved.
5. **Iframes and payment pages.** Explore same-origin and cross-origin iframes and hosted payment fields to discover what is filled and whether the panel explains what was not.
6. **Large forms.** Explore a form with more than 200 fields to discover whether filling stays fast and the panel stays usable.
7. **Boundary data in your own application.** Fill each field of your application with Boundary values one at a time to discover which valid edge cases it wrongly rejects (`O'Brien`, `Zoë`, plus-addressed email, ZIP `00501`, a 19-digit card). Each rejection is a candidate defect.
8. **Invalid data in your own application.** Make one field at a time Invalid and submit, to discover which rules the application does not enforce. The demo finds one this way: the sample app accepts the voided SSN `078-05-1120`.

## Using it to test your own application

- Test one rule at a time: keep the page Valid and switch a single field to Invalid. One error is expected per submission; more than one, or none, needs a closer look.
- Use **↻** on an invalid row to step through the other invalid cases for that field.
- Put the seed in your defect report, or paste the **Copy Markdown** table, so whoever re-tests can reproduce the exact data.
- Keep a seed (**Keep**) for regression runs so the same data set is used every time.

## Recording the demo video

`npm run demo` records `docs/demo/bfs-test-data-filler-demo.mp4`, a captioned `.srt` file and `poster.png`. It needs Linux with `xvfb-run` and `ffmpeg`. It starts the sample app and fixture server, opens a real headed Chromium on a virtual display, opens the real side panel from the welcome page, drives the panel over the Chrome DevTools Protocol, records the screen and adds the captions with ffmpeg. The red click circles and captions exist only in the recording.

The demo uses seed `1083`. With that seed the valid applicant is approved for the Platinum card, the first invalid SSN is `666-12-3456` (rejected) and the next one is the voided `078-05-1120` (accepted, which is the finding the demo ends on).
