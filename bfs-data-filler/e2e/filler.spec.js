'use strict';

const { test, expect, openApp, FIXTURES_URL } = require('./extension');
const C = require('../lib/checksums.js');

test.describe('sample credit card application (US)', () => {
  test('detects what each field expects', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    const rows = await panel.rows();
    const types = Object.fromEntries(Object.entries(rows).map(([label, r]) => [label, r.type]));

    expect(types).toMatchObject({
      'First name': 'firstName',
      'Last name': 'lastName',
      'Date of birth': 'dob',
      'Social Security Number': 'ssn',
      Email: 'email',
      'Mobile phone': 'phone',
      'Street address': 'addressLine1',
      'Apt, suite, unit (optional)': 'addressLine2',
      City: 'city',
      State: 'state',
      'ZIP code': 'postalCode',
      'Monthly rent / mortgage ($)': 'amount',
      'Total annual income ($)': 'income',
      'Other monthly debt payments ($)': 'amount',
      'Estimated credit score': 'creditScore',
      'Have you filed for bankruptcy in the last 7 years?': 'choice',
      '1. Choose your card': 'choice',
    });
    expect(Object.values(rows).filter((r) => r.type === 'consent')).toHaveLength(1);
    expect(Object.keys(rows)).toHaveLength(21);
  });

  test('valid data passes the application’s validation', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.seed(20261009);
    await panel.fill();

    const rows = await panel.rows();
    expect(C.isSsnValid(rows['Social Security Number'].value)).toBe(true);
    expect(Object.values(rows).every((r) => r.status === 'filled')).toBe(true);

    await app.getByTestId('submit').click();
    await expect(app).toHaveURL(/result\.html/);
    await expect(app.getByTestId('form-error')).toHaveCount(0);

    // The panel follows the navigation: no fields on the result page, so nothing to export.
    await expect(panel.page.getByTestId('summary')).toHaveText('No form fields found on this page.');
    await expect(panel.page.getByRole('button', { name: 'Copy JSON' })).toBeHidden();
  });

  test('invalid data is rejected field by field', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.profile('Invalid');
    await panel.fill();

    await app.getByTestId('submit').click();
    await expect(app.getByTestId('form-error')).toBeVisible();
    await expect(app.getByTestId('form-error')).toContainText('Please correct');
    await expect(app.getByTestId('error-agreeToTerms')).toBeVisible();
  });

  test('one invalid field among valid ones gives a single targeted error', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.seed(7);
    await panel.fill();

    const before = await panel.rows();
    await panel.row('ZIP code').locator('select.prof').selectOption('invalid');
    await expect(panel.row('ZIP code')).toHaveAttribute('data-profile', 'invalid');
    const after = await panel.rows();

    // Only the ZIP code changed.
    for (const [label, row] of Object.entries(after)) {
      if (label !== 'ZIP code') expect(row.value, label).toBe(before[label].value);
    }
    expect(after['ZIP code'].note).not.toBe('');

    await app.getByTestId('submit').click();
    await expect(app.getByTestId('error-zip')).toBeVisible();
    await expect(app.locator('.field-error')).toHaveCount(1);
  });

  test('the same seed reproduces the same data, and Restore puts back the original values', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.seed(424242);
    await panel.fill();
    const first = await panel.rows();

    await panel.page.getByRole('button', { name: 'Restore' }).click();
    await expect(app.getByTestId('firstName')).toHaveValue('');
    await expect(app.getByTestId('agreeToTerms')).not.toBeChecked();

    await panel.fill();
    expect(await panel.rows()).toEqual(first);
  });

  test('boundary profile explains each edge case', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.profile('Boundary');
    await panel.fill();
    const rows = await panel.rows();
    expect(rows['Estimated credit score'].value).toMatch(/^(300|850)$/);
    expect(rows['Social Security Number'].note).not.toBe('');
    expect(Object.values(rows).every((r) => r.profile === 'boundary')).toBe(true);
  });

  test('changing a field’s type re-fills just that field', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.fill();
    await panel.row('Street address').locator('select.type').selectOption('text');
    await expect(panel.row('Street address').locator('.value')).toHaveText(/^Test /);
    await expect(app.getByTestId('addressLine1')).toHaveValue(/^Test /);
  });

  test('exports the data set as JSON and Markdown evidence', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.seed(99);
    await panel.fill();
    await panel.page.evaluate(() => {
      window.__copied = [];
      navigator.clipboard.writeText = async (t) => { window.__copied.push(t); };
    });
    await panel.page.getByRole('button', { name: 'Copy JSON' }).click();
    await panel.page.getByRole('button', { name: 'Copy Markdown' }).click();
    const [json, md] = await panel.page.evaluate(() => window.__copied);

    const evidence = JSON.parse(json);
    expect(evidence).toMatchObject({ seed: 99, region: 'US', profile: 'valid', page: { title: expect.stringContaining('Credit Card') } });
    expect(evidence.fields).toHaveLength(21);
    expect(md).toContain('| Field | Type | Profile | Value | Note |');
    expect(md).toContain('seed 99');
  });
});

test.describe('India KYC form', () => {
  test('fills checksum-valid Indian identifiers', async ({ context, openPanel }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES_URL}india-kyc.html`);
    const panel = await openPanel(page);
    await panel.region('India');
    await expect(panel.row('PAN').locator('select.type')).toHaveValue('pan');
    await panel.fill();

    const v = (name) => page.locator(`[name="${name}"]`).inputValue();
    expect(C.isPanValid(await v('pan_no'))).toBe(true);
    expect(C.isAadhaarValid((await v('aadhaar')).replace(/\s/g, ''))).toBe(true);
    expect(C.isIfscValid(await v('ifsc'))).toBe(true);
    expect(C.isGstinValid(await v('gstin'))).toBe(true);
    expect(C.isUpiValid(await v('vpa'))).toBe(true);
    expect(await v('mobile')).toMatch(/^[6-9]\d{9}$/);
    expect(await v('pincode')).toMatch(/^[1-9]\d{5}$/);
    expect(await v('dob')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(Number(await v('loanAmt'))).toBeGreaterThanOrEqual(10000);
    const tenure = Number(await v('tenure'));
    expect(tenure).toBeGreaterThanOrEqual(6);
    expect(tenure).toBeLessThanOrEqual(84);
    expect(await page.locator('[name="state"]').inputValue()).not.toBe('');
    await expect(page.locator('[name="consent"]')).toBeChecked();
  });
});

test.describe('UK payee form', () => {
  test('reaches shadow DOM and iframe fields and updates framework state', async ({ context, openPanel }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES_URL}uk-payee.html`);
    const panel = await openPanel(page);
    await panel.region('UK / EU');
    await panel.fill();
    const rows = await panel.rows();

    expect(rows['National Insurance number'].type).toBe('niNumber');
    expect(C.isNiNumberValid(await page.locator('#nino').inputValue())).toBe(true);
    expect(C.isIbanValid(await page.locator('#iban').inputValue())).toBe(true);
    expect(C.isBicValid(await page.locator('#bic').inputValue())).toBe(true);
    expect(await page.locator('#sortcode').inputValue()).toMatch(/^\d{2}-\d{2}-\d{2}$/);
    expect(await page.locator('#acct').inputValue()).toMatch(/^\d{8}$/);
    expect(await page.locator('#country').inputValue()).toBe('GB');

    // Shadow DOM
    expect(rows['Payment reference']).toMatchObject({ status: 'filled', type: 'text' });
    expect(await page.locator('payment-ref').evaluate((el) => el.shadowRoot.querySelector('input').value)).not.toBe('');

    // Same-origin iframe
    const card = page.frameLocator('iframe');
    const number = await card.locator('#cc').inputValue();
    expect(C.isLuhnValid(number)).toBe(true);
    expect(number.length).toBeLessThanOrEqual(23);
    expect(await card.locator('#exp').inputValue()).toMatch(/^(0[1-9]|1[0-2])\/\d{2}$/);
    expect(await card.locator('#cvv').inputValue()).toMatch(/^\d{3,4}$/);

    // Controlled-input store saw input events
    const state = JSON.parse(await page.getByTestId('state').textContent());
    expect(state.iban).toBe(await page.locator('#iban').inputValue());
  });

  test('Restore brings back a prefilled value', async ({ context, openPanel }) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES_URL}uk-payee.html`);
    const panel = await openPanel(page);
    await panel.fill();
    await expect(page.locator('#prefilled')).not.toHaveValue('ORIGINAL-REF');
    await panel.page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('#prefilled')).toHaveValue('ORIGINAL-REF');
  });
});

test.describe('extension surface', () => {
  test('context menu path: background fill reports to the badge', async ({ context, serviceWorker }) => {
    const app = await openApp(context);
    await app.bringToFront();
    const badge = await serviceWorker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      // Same code path the context menu and Alt+Shift+F use.
      await quickRun(tab, 'fill', 'valid');
      return chrome.action.getBadgeText({ tabId: tab.id });
    }, app.url());
    expect(Number(badge)).toBe(21);
    await expect(app.getByTestId('firstName')).not.toHaveValue('');
  });

  test('side panel fits a narrow width without sideways scrolling', async ({ context, openPanel }) => {
    const app = await openApp(context);
    const panel = await openPanel(app);
    await panel.fill();
    for (const width of [300, 360]) {
      await panel.page.setViewportSize({ width, height: 800 });
      expect(await panel.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });

  test('generate tab produces values with notes', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await page.getByRole('tab', { name: 'Generate' }).click();
    await page.locator('#gen-type').selectOption('iban');
    await page.locator('#gen-profile').selectOption('invalid');
    await page.locator('#gen-count').fill('6');
    await page.getByRole('button', { name: 'Generate' }).click();
    const items = page.locator('#gen-results li');
    await expect(items).toHaveCount(6);
    for (const value of await items.locator('.value').allTextContents()) expect(C.isIbanValid(value)).toBe(false);
  });
});
