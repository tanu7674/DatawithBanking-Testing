// Records the demo video: a real (headed) Chromium with the extension's real side panel,
// driven by a script, captured from a virtual display with ffmpeg, then captioned.
//
//   npm run demo        (Linux, needs xvfb-run and ffmpeg; output in docs/demo/)
//
// The side panel is not a Playwright page, so it is driven over the Chrome DevTools Protocol.
// Click "pulses" and captions are added only for the recording; they are not part of the extension.

import { chromium } from '@playwright/test';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..');
const OUT = path.join(EXT, 'docs', 'demo');
const W = 1440;
const H = 900;
const BAR = 84;
const APP = 'http://127.0.0.1:4318/';
const FIX = 'http://127.0.0.1:4319/';
const CDP_PORT = 9339;
const SEED = 1083; // Platinum applicant with a score of 802; SSN re-roll 1 is the voided "wallet" SSN

if (!process.env.DISPLAY) {
  const r = spawnSync('xvfb-run', ['-a', '-s', `-screen 0 ${W}x${H}x24`, process.execPath, fileURLToPath(import.meta.url)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- servers ------------------------------------------------------------------

const children = [];
function start(cmd, args, env) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  children.push(child);
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error(`server did not start: ${url}`);
}
start(process.execPath, [path.join(EXT, 'sample-app/src/server.js')], { PORT: '4318', MOCK_LATENCY_MS: '900' });
start(process.execPath, [path.join(EXT, 'e2e/fixtures-server.js'), '4319']);
await waitFor(APP);
await waitFor(`${FIX}health`);

// ---- browser ------------------------------------------------------------------

const profileDir = mkdtempSync(path.join(tmpdir(), 'bfs-demo-'));
// Keep Chrome's own autofill and password prompts out of the recording.
mkdirSync(path.join(profileDir, 'Default'), { recursive: true });
writeFileSync(path.join(profileDir, 'Default', 'Preferences'), JSON.stringify({
  autofill: { profile_enabled: false, credit_card_enabled: false },
  credentials_enable_service: false,
  profile: { password_manager_enabled: false },
}));
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    `--window-size=${W},${H}`, '--window-position=0,0', `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble', '--disable-features=Translate',
  ],
});

await context.addInitScript(() => {
  window.__demoPulse = (x, y) => {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;` +
      'background:rgba(239,68,68,.3);border:3px solid #ef4444;pointer-events:none;z-index:2147483647;transition:all .6s ease-out';
    document.documentElement.append(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1.8)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 700);
  };
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const welcome = context.pages().find((p) => p.url().includes('welcome.html')) || (await context.waitForEvent('page'));
await welcome.waitForLoadState();
for (const p of context.pages()) if (p !== welcome) await p.close();
const page = welcome;

async function pageClick(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.evaluate(([x, y]) => window.__demoPulse && window.__demoPulse(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  await sleep(350);
  await locator.click();
}
const pageScroll = (top) => page.evaluate((t) => window.scrollBy({ top: t, behavior: 'smooth' }), top);

// ---- side panel over CDP ---------------------------------------------------------

let panelWs;
let msgId = 0;
const pending = new Map();
async function connectPanel() {
  for (let i = 0; i < 50; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const t = targets.find((x) => x.url.includes('/sidepanel/sidepanel.html'));
    if (t) {
      panelWs = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r) => (panelWs.onopen = r));
      panelWs.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      };
      return;
    }
    await sleep(100);
  }
  throw new Error('side panel did not open');
}
function panel(expression) {
  const id = ++msgId;
  panelWs.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  return new Promise((r) => pending.set(id, r)).then((m) => m.result?.result?.value);
}
const PANEL_HELPERS = `
  window.__q = (sel, text) => [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text));
  window.__row = (label) => [...document.querySelectorAll('[data-testid=row]')].find((r) => r.querySelector('.row-label').textContent === label);
  window.__pulseAt = (el) => {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:' + (r.left + r.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(239,68,68,.3);border:3px solid #ef4444;pointer-events:none;z-index:99999;transition:all .6s ease-out';
    document.body.append(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1.8)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 700);
  };
  window.__click = (el) => { window.__pulseAt(el); setTimeout(() => el.click(), 350); };
  window.__select = (el, value) => { window.__pulseAt(el); setTimeout(() => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, 350); };
  true;`;
const panelClick = async (js) => { await panel(`window.__click(${js})`); await sleep(500); };
const panelSelect = async (js, value) => { await panel(`window.__select(${js}, ${JSON.stringify(value)})`); await sleep(500); };
const panelScroll = (top) => panel(`document.scrollingElement.scrollBy({ top: ${top}, behavior: 'smooth' })`);
async function panelReady(text = 'fields') {
  for (let i = 0; i < 100; i++) {
    if (await panel(`(document.getElementById('summary').textContent.includes(${JSON.stringify(text)}) && !document.getElementById('fill').disabled)`)) return;
    await sleep(100);
  }
  throw new Error(`panel never showed "${text}"`);
}
async function panelFill() {
  await panelClick(`document.getElementById('fill')`);
  await panelReady('filled');
}
async function gotoForm(url) {
  await page.goto(url);
  if (url === APP) await page.waitForFunction(() => document.querySelector('#state').options.length > 1);
  await sleep(600);
  await panelReady();
}

// ---- recording and captions ------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const raw = path.join(profileDir, 'raw.mp4');
const ffmpeg = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-video_size', `${W}x${H}`, '-framerate', '25', '-i', process.env.DISPLAY,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'ignore'] });
const t0 = Date.now() + 400; // ffmpeg start-up
const captions = [];
function caption(text) {
  const t = (Date.now() - t0) / 1000;
  if (captions.length) captions[captions.length - 1].end = t;
  captions.push({ text, start: t, end: null });
}

try {
  await sleep(1200);
  caption('BFS Test Data Filler – a Chrome extension that fills banking forms with synthetic test data');
  await sleep(3500);
  caption('Open the side panel from the toolbar icon (or the welcome page)');
  await pageClick(page.getByTestId('open-panel'));
  await connectPanel();
  await sleep(800);
  await panel(PANEL_HELPERS);

  // Detection
  caption('On the credit card form it finds 21 fields and works out what each one expects');
  await gotoForm(APP);
  await panel(PANEL_HELPERS);
  await sleep(1500);
  await panelScroll(420);
  await sleep(1800);
  await panelScroll(-420);
  await sleep(800);
  caption(`A seed makes the data reproducible – seed ${SEED} gives the same applicant every time`);
  await panel(`(() => { const s = document.getElementById('seed'); window.__pulseAt(s); s.value = '${SEED}'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(2500);

  // Valid
  caption('Valid profile: one consistent synthetic applicant, highlighted in green');
  await panelFill();
  await sleep(1200);
  await pageScroll(500);
  await sleep(1600);
  await pageScroll(700);
  await sleep(1600);
  caption('Submit – the application accepts every value');
  await pageClick(page.getByTestId('submit'));
  await page.waitForURL(/result\.html/);
  await sleep(3500);

  // Single negative test
  caption('Negative test: make only the SSN invalid – everything else stays valid');
  await gotoForm(APP);
  await panel(PANEL_HELPERS);
  await panelFill();
  await sleep(600);
  await panelSelect(`window.__row('Social Security Number').querySelector('select.prof')`, 'invalid');
  await panelReady('filled');
  await sleep(800);
  caption('The note says which rule it breaks: area 666 is never issued');
  await sleep(2800);
  await pageClick(page.getByTestId('submit'));
  await page.getByTestId('error-ssn').waitFor();
  await page.getByTestId('ssn').scrollIntoViewIfNeeded();
  caption('The app rejects it with exactly one field error – as it should');
  await pageScroll(-120);
  await sleep(3200);

  // Finding
  caption('Next invalid SSN: 078-05-1120, the 1938 "wallet" number that was publicly voided');
  await panelClick(`window.__row('Social Security Number').querySelector('.row-ctl .btn')`);
  await panelReady('filled');
  await sleep(2600);
  await pageClick(page.getByTestId('submit'));
  await page.waitForURL(/result\.html/);
  caption('Finding: the app approves an application with a voided SSN – log a defect');
  await sleep(4000);

  // Boundary
  caption('Boundary profile: valid edge cases – turns 18 today, credit score 300 or 850, ZIP 00501…');
  await gotoForm(APP);
  await panel(PANEL_HELPERS);
  await panelClick(`window.__q('#profile button', 'Boundary')`);
  await panelFill();
  await sleep(1500);
  await panelScroll(380);
  await pageScroll(400);
  await sleep(2200);
  await panelScroll(380);
  await pageScroll(500);
  await sleep(2200);

  // India
  caption('Region India: PAN, Aadhaar (Verhoeff check), IFSC, GSTIN (check character), UPI, PIN code');
  await gotoForm(`${FIX}india-kyc.html`);
  await panel(PANEL_HELPERS);
  await panelClick(`window.__q('#profile button', 'Valid')`);
  await panelClick(`window.__q('#region button', 'India')`);
  await panelReady();
  await panelFill();
  await sleep(2000);
  await pageScroll(420);
  await panelScroll(400);
  await sleep(2600);

  // UK
  caption('Region UK/EU: IBAN (mod-97), sort code, NI number – including fields in an iframe and a web component');
  await gotoForm(`${FIX}uk-payee.html`);
  await panel(PANEL_HELPERS);
  await panelClick(`window.__q('#region button', 'UK')`);
  await panelReady();
  await panelFill();
  await sleep(2000);
  await pageScroll(450);
  await sleep(2400);
  await pageScroll(450);
  await sleep(2200);

  // Generate tab
  caption('Generate tab: values for API tests – every invalid value says why it is invalid');
  await panelClick(`document.getElementById('tab-generate')`);
  await panelSelect(`document.getElementById('gen-type')`, 'iban');
  await panelSelect(`document.getElementById('gen-profile')`, 'invalid');
  await panel(`document.getElementById('gen-count').value = '6'`);
  await panelClick(`document.getElementById('gen-run')`);
  await sleep(4000);

  caption('Runs locally: no network access, nothing collected. Copy the data as JSON or Markdown for your evidence.');
  await panelClick(`document.getElementById('tab-fill')`);
  await panelScroll(2000);
  await sleep(4500);
  captions[captions.length - 1].end = (Date.now() - t0) / 1000;
} finally {
  ffmpeg.stdin.write('q');
  await new Promise((r) => ffmpeg.on('close', r));
  await context.close();
  for (const c of children) c.kill();
}

// ---- captions, poster, subtitles ----------------------------------------------------------

const font = (() => {
  for (const q of ['Inter:semibold', 'DejaVu Sans:bold']) {
    try { return execFileSync('fc-match', ['-f', '%{file}', q]).toString(); } catch { /* try next */ }
  }
  return '';
})();
const filters = [`pad=${W}:${H + BAR}:0:0:color=0x0f172a`];
captions.forEach((c, i) => {
  const file = path.join(profileDir, `caption-${i}.txt`);
  writeFileSync(file, c.text);
  filters.push(`drawtext=fontfile='${font}':textfile='${file}':fontcolor=white:fontsize=27:x=(w-text_w)/2:y=${H}+(${BAR}-text_h)/2:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`);
});
const video = path.join(OUT, 'bfs-test-data-filler-demo.mp4');
execFileSync('ffmpeg', ['-y', '-i', raw, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { stdio: 'ignore' });

const posterAt = captions.find((c) => c.text.startsWith('Valid profile'));
execFileSync('ffmpeg', ['-y', '-ss', String(posterAt.start + 2.5), '-i', video, '-frames:v', '1', path.join(OUT, 'poster.png')], { stdio: 'ignore' });

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(path.join(OUT, 'bfs-test-data-filler-demo.srt'),
  captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));

rmSync(profileDir, { recursive: true, force: true });
console.log(`Demo written to ${video} (${captions.length} captions, ${captions[captions.length - 1].end.toFixed(0)} s)`);
