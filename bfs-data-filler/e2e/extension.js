'use strict';

// Playwright fixtures that load the unpacked extension into Chromium and drive its side panel.
const path = require('node:path');
const { test: base, expect, chromium } = require('@playwright/test');

const EXTENSION_DIR = path.join(__dirname, '..');
const APP_URL = 'http://127.0.0.1:4318/';
const FIXTURES_URL = 'http://127.0.0.1:4319/';

/** Wraps the side panel page (opened as a tab pinned to the page under test). */
class Panel {
  constructor(page) {
    this.page = page;
  }

  async region(label) { await this.page.locator('#region').getByRole('radio', { name: label }).click(); }
  async profile(label) { await this.page.locator('#profile').getByRole('radio', { name: label }).click(); }

  async seed(value) {
    await this.page.locator('#seed').fill(String(value));
    await this.page.locator('#seed').blur();
  }

  async fill() {
    await this.page.getByTestId('fill').click();
    await expect(this.page.getByTestId('summary')).toContainText('filled');
    await expect(this.page.getByTestId('fill')).toBeEnabled();
  }

  row(label) { return this.page.getByTestId('row').filter({ has: this.page.locator('.row-label', { hasText: label }) }).first(); }

  /** { label: { type, profile, status, value, note } } for every row. */
  async rows() {
    return this.page.getByTestId('row').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [
      r.querySelector('.row-label').textContent,
      {
        type: r.querySelector('select.type').value,
        profile: r.dataset.profile,
        status: r.dataset.status,
        value: r.querySelector('.value')?.textContent ?? null,
        note: r.querySelector('.note').textContent,
      },
    ])));
  }
}

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  /** openPanel(page) -> Panel attached to that page's tab. */
  openPanel: async ({ context, serviceWorker, extensionId }, use) => {
    await use(async (target) => {
      const tabId = await serviceWorker.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id, target.url());
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html?tabId=${tabId}`);
      await expect(page.getByTestId('summary')).toContainText('fields');
      return new Panel(page);
    });
  },
});

/** Opens the sample credit card application and waits for its async state list. */
async function openApp(context) {
  const page = await context.newPage();
  await page.goto(APP_URL);
  await page.waitForFunction(() => document.querySelector('#state').options.length > 1);
  return page;
}

module.exports = { test, expect, Panel, openApp, APP_URL, FIXTURES_URL, EXTENSION_DIR };
