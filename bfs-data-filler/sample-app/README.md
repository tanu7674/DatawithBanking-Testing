# STLC-In-Banking — Credit Card Application Demo (USA)

A small **dummy** credit card application for practising the Software Testing Life Cycle in a banking context.

- **Front end** — a web form for applicant details (personal info, SSN, US address, income, debts, credit score, card choice, shipping speed).
- **Mock decision API** — validates the request and returns a deterministic **APPROVED** / **REJECTED** decision.
- **Result page** — if approved, shows a dummy (Luhn-valid, non-real) card number, credit limit, APR, expiry and the **estimated delivery window**. If rejected, it shows the reasons.

No real bank, credit bureau or personal data is involved. It has no dependencies; you only need Node.js 18+.

## Run it

```bash
npm start            # http://localhost:3000
npm test             # unit + API tests (node:test)
npm run test:coverage  # tests + line/branch/function coverage report
```

Environment variables: `PORT` (default `3000`) and `MOCK_LATENCY_MS`, which is a delay that simulates a bureau call (default `1200`; use `0` to turn it off).

Click **Fill sample data** on the form to get an application that will be approved.

## Project layout

```
src/server.js     HTTP server: static files + REST API (in-memory store)
src/decision.js   Validation and underwriting rules
src/card.js       Dummy card number (Luhn), expiry, delivery-date calculation
public/           index.html (application form), result.html (decision page), JS, CSS
test/             node:test suites for rules and API
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/applications` | Submit an application. `201` with decision, `422` on validation errors, `400` on malformed JSON, `413` if the body is over 64 KB |
| `GET` | `/api/applications/{id}` | Fetch a previous decision (`404` if unknown; the store resets on restart) |
| `GET` | `/api/reference-data` | US states, card products, shipping windows |
| `GET` | `/api/health` | `{ "status": "UP" }` |

Any of these paths called with the wrong HTTP method returns `405` with an `Allow` header.

### Request body

```json
{
  "cardProduct": "CLASSIC | REWARDS | PLATINUM",
  "firstName": "Jane", "lastName": "Doe",
  "dateOfBirth": "1990-04-15",
  "ssn": "123-45-6789",
  "email": "jane.doe@example.com", "phone": "(555) 123-4567",
  "addressLine1": "742 Evergreen Terrace", "addressLine2": "Apt 2B",
  "city": "Springfield", "state": "IL", "zip": "62704",
  "housingStatus": "RENT | OWN | MORTGAGE | OTHER",
  "monthlyHousingPayment": 1400,
  "employmentStatus": "EMPLOYED | SELF_EMPLOYED | RETIRED | STUDENT | UNEMPLOYED",
  "annualIncome": 85000,
  "monthlyDebtPayments": 350,
  "creditScore": 725,
  "bankruptcyLast7Years": false,
  "shippingMethod": "STANDARD | EXPEDITED",
  "agreeToTerms": true
}
```

### Approved response (abridged)

```json
{
  "applicationId": "APP-20260929-C2ACD7",
  "decision": "APPROVED",
  "card": { "number": "4000 0071 1422 2794", "maskedNumber": "**** **** **** 2794",
            "network": "VISA", "expiry": "09/31", "creditLimit": 10000, "apr": 24.99 },
  "delivery": { "method": "EXPEDITED", "carrier": "Expedited (UPS 2nd Day)", "businessDays": "2-3",
                "earliest": "2026-10-01", "latest": "2026-10-02", "address": { "...": "..." } }
}
```

A rejected response has `"decision": "REJECTED"`, a `reasons` array and an `adverseActionNotice`. It has no `card` or `delivery`.

## Decision rules (for designing test cases)

A request must first pass **validation** or the API returns `422` with per-field `details`:

- Names use letters, spaces, `'` and `-`, with a maximum of 50 characters. The email must be valid. The phone number must be a 10-digit US number.
- The SSN must be 9 digits. Invalid issued numbers are rejected: area `000`, `666` or `9xx`, group `00`, or serial `0000`.
- The state must be a valid US state or DC. The ZIP must be `12345` or `12345-6789`.
- Money amounts must be numbers of 0 or more. The credit score must be an integer from 300 to 850. The date of birth must be a real date in `YYYY-MM-DD` format and not in the future.
- `agreeToTerms` must be `true`.

A valid application is **rejected** if any of these rules match. All matching reasons are returned.

| Rule | Reject when |
|---|---|
| Age | Younger than 18 on the application date |
| Income | `annualIncome` < $12,000 |
| Credit score | Below the product minimum: Classic 580, Rewards 670, Platinum 740 |
| Debt-to-income | `(monthlyDebtPayments + monthlyHousingPayment) / (annualIncome / 12)` > 45% |
| Bankruptcy | `bankruptcyLast7Years` is `true` |
| Unemployed | `employmentStatus` is `UNEMPLOYED` and income < $25,000 |

Otherwise the application is **approved**:

| Credit score | Limit (% of income, rounded down to $100) | Cap | APR |
|---|---|---|---|
| 800+ | 30% | $50,000 | 17.99% |
| 740–799 | 20% | $25,000 | 20.99% |
| 670–739 | 12% | $10,000 | 24.99% |
| 580–669 | 6% | $3,000 | 29.99% |

The minimum limit is $500.

### Card number and delivery

- Card numbers are 16 digits that start with the dummy BIN `400000` and pass the Luhn check. They are randomly generated and are **not real cards**.
- The card expires 5 years after the approval month (`MM/YY`).
- The delivery window counts **business days** from the approval date and skips weekends and US federal holidays (2025–2027):
  - Standard (USPS First-Class): 7–10 business days
  - Expedited (UPS 2nd Day): 2–3 business days

### Quick test data

| Scenario | Changes from the sample data |
|---|---|
| Approved (Classic) | Sample data as-is |
| Rejected: credit score | Platinum card with score 725 |
| Rejected: DTI | Monthly debt payments of 3000 |
| Rejected: under 18 | Date of birth less than 18 years ago |
| Rejected: multiple reasons | Score 500 and bankruptcy = Yes |
| Validation error | ZIP `1234`, SSN `000-12-3456`, or terms not ticked |

Form elements and result fields have `data-testid` attributes for UI automation, for example `firstName`, `submit`, `card-number`, `delivery-window` and `reject-reasons`.

## Unit test agent

`.claude/agents/unit-test-writer.md` defines a [Claude Code subagent](https://code.claude.com/docs/en/sub-agents) that reads the application code and writes or extends the unit tests in `test/`. It uses boundary values, equivalence classes and decision tables, runs the tests, compares coverage before and after, and reports any suspected defects. It only uses Node's built-in test runner.

To use it, open Claude Code in this repository and ask, for example:

```
Use the unit-test-writer agent to create unit tests for src/card.js
Use the unit-test-writer agent to raise branch coverage for the whole app
```

Run `/agents` in Claude Code to check that the agent is listed.
