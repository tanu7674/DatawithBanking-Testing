# BFS Test Data Filler

A Chrome extension (Manifest V3) for testers in banking and financial services. It fills web forms with **synthetic test data that passes the rules banking systems check**: card numbers with valid Luhn digits, IBANs that pass mod-97, ABA routing numbers, SSNs, PAN, Aadhaar (Verhoeff), IFSC, GSTIN, UPI IDs, sort codes and more. It can also fill **boundary** and **invalid** values, and each one comes with a note saying why it was chosen.

It runs entirely in the browser. It makes no network requests and collects nothing.

[![Demo video](docs/demo/poster.png)](docs/demo/bfs-test-data-filler-demo.mp4)

▶ [Watch the 75-second demo](docs/demo/bfs-test-data-filler-demo.mp4) ([captions](docs/demo/bfs-test-data-filler-demo.srt))

## Why

Generic form fillers type `John Smith` and `1234567890`. Banking forms reject that: the card number fails Luhn, the IBAN fails mod-97, the SSN area is never issued. So testers type data by hand or keep spreadsheets of "good" numbers. Negative testing is even slower, because you need values that break **one** rule at a time and you need to know which rule.

## What it does

- **Detects what each field expects** from its label, `name`/`id`, `autocomplete`, placeholder and input type, and shows how confident it is. You can change any field's type.
- **Three profiles:**
  - <span>🟢</span> **Valid**: one consistent synthetic applicant (name, email, address, date of birth and card holder all match).
  - <span>🟠</span> **Boundary**: still valid, but on an edge apps often get wrong: turns 18 today, `O'Brien`, ZIP `00501`, credit score 300 or 850, a 19-digit Visa, plus-addressed email.
  - <span>🔴</span> **Invalid**: breaks one rule and says which one: SSN area 666, IBAN check digits wrong, PAN with a bad holder type, expired card, an injection probe.
- **Single-field negative tests**: set one field to *Invalid* in the panel while the rest stay valid, so the app should show exactly one error.
- **Three regions**: US, India and UK/EU. The region sets phone, postal code, ID and account formats.
- **Reproducible**: every fill has a seed. The same seed gives the same data, which is useful for defect reports and re-tests.
- **Evidence**: copy the data set as JSON or as a Markdown table for Jira or your test management tool.
- **Works on real apps**: it fills the way a user types (fires `input`, `change` and `blur`), so React, Angular and Vue forms update their state. It also reaches same-origin iframes and open shadow DOM.
- **Restore** puts back the values the page had before filling.
- **Generate tab**: values with notes, without a page, for API tests in Postman or similar tools.
- **Shortcuts**: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fills the page with valid data. The right-click menu offers valid, boundary or invalid fills.

## Install (developer mode)

1. Clone this repository.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `bfs-data-filler` folder.
4. Pin the extension, open your form and click the icon. The side panel opens.

It works on `http://localhost` and `http://127.0.0.1` straight away. On other sites, either click the icon on the page (one-time access for that tab) or click **Allow on all sites** in the panel.

To try it on the demo credit card application included in this repository: `cd sample-app && npm start`, then open http://localhost:3000. It needs Node.js 18 or later and has no dependencies.

For a Chrome Web Store upload or an enterprise policy install, `npm run package` builds `dist/bfs-test-data-filler-<version>.zip`.

## Data types

| Group | Types | Rules applied |
|---|---|---|
| Personal | first, last and full name, email, phone/mobile, date of birth, password, OTP | `example.com` emails (RFC 2606); fictional phone ranges (US 555-01xx, UK Ofcom 07700 900xxx); adult date of birth |
| Address | lines 1 and 2, city, state, ZIP/PIN/postcode, country | consistent city, state and postal code per region |
| United States | SSN, ABA routing number | SSN issuance rules (no 000, 666 or 9xx area, no 00 group, no 0000 serial); ABA 3-7-1 checksum and Federal Reserve prefix |
| India | PAN, Aadhaar, IFSC, GSTIN, UPI ID | PAN holder-type character; Aadhaar Verhoeff check digit; IFSC 5th character `0`; GSTIN check character and state code |
| UK / Europe | IBAN (GB, DE, NL, IE), BIC/SWIFT, sort code, National Insurance number | IBAN mod-97 and country length; ISO 9362 BIC; HMRC NI prefix and suffix rules |
| Cards | number, expiry (MM/YY or month/year), CVV, name on card | Luhn; brand prefixes and lengths (Visa, Mastercard, Amex, Discover, RuPay); future expiry |
| Banking | account number, amount, annual income, credit score, interest rate, tenure | field `min`, `max`, `step` and `maxlength` respected for valid data |
| Generic | text, number, date, select/radio, consent checkbox, checkbox | |

Valid values are fitted to the field (`maxlength`, number and date inputs). Invalid values deliberately are not: over-length values bypass `maxlength` the way a script or API client could.

## Privacy and permissions

| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Read and fill the form on the tab you are on, only when you ask |
| `localhost`, `127.0.0.1` host access | Works on local apps without asking each time |
| Optional: all sites | Only if you click **Allow on all sites** |
| `sidePanel`, `contextMenus`, `storage` | The panel, the right-click menu, and remembering region, profile and seed |

The extension pages have a `connect-src 'none'` content security policy, so they cannot make network requests. There is no analytics and no remote code.

> The data is synthetic, but a format-valid SSN, Aadhaar or account number can still match a real one by chance. Use it in test environments only.

## How it is built

```
manifest.json          MV3 manifest: side panel, background worker, commands, CSP
background.js          context menu and keyboard shortcut fills, badge
lib/checksums.js       Luhn, Verhoeff, IBAN mod-97, ABA, GSTIN and format validators
lib/generators.js      seeded data generators: valid, boundary and invalid cases with notes
lib/classifier.js      works out a field's data type from its label and attributes
lib/runner.js          injects the filler into a tab and runs a command in every frame
content/filler.js      finds fields (including shadow DOM), fills them like a user, highlights, restores
sidepanel/             the side panel UI
welcome/               first-run page
e2e/, test/            Playwright and node:test suites (see TESTING.md)
demo/record-demo.mjs   records the demo video
sample-app/            demo credit card application the tests and demo run against (not part of the extension)
docs/demo/             the demo video, captions and poster
```

`npm run package` zips only the extension's own files, so `sample-app/`, the tests and `node_modules/` never ship.

There is no build step and there are no runtime dependencies. The `lib/` files run unchanged in the browser and in Node tests.

## Testing

See [TESTING.md](TESTING.md). In short:

```bash
npm install
npm test            # unit tests: checksums, generators, classifier
npm run test:e2e    # loads the extension into Chromium and tests it against the sample app and fixtures
```

## Limitations

- **Format-valid, not real.** IFSC, BIC and sort codes follow the format but are not checked against bank directories. UK modulus checking for account numbers is not applied. French, Spanish and Italian IBANs are not generated.
- **Cross-origin iframes** (for example a hosted payment page) are filled only if the extension has access to that origin. Closed shadow roots cannot be reached.
- **Custom widgets** built from `div`s (custom drop-downs, date pickers) are not filled. Native `input`, `select` and `textarea` are.
- Field detection is rule-based. A field with no label and no meaningful name falls back to a generic type, which you can change in the panel.

## Roadmap

- Optional on-device AI (Chrome's built-in model) to classify fields the rules cannot, with nothing leaving the browser.
- Saved personas and per-application rules (for example "this bank's account numbers are 14 digits").
- Export the data set as a Playwright or Selenium fixture.
