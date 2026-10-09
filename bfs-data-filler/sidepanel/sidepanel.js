'use strict';

(function () {
  const G = globalThis.BFSGenerators;
  const R = globalThis.BFSRunner;
  const $ = (id) => document.getElementById(id);
  const VERSION = chrome.runtime.getManifest().version;

  // ?tabId=N pins the panel to one tab. Used when the panel is opened as a normal page (tests, pop-out).
  const params = new URLSearchParams(location.search);
  const pinnedTabId = params.has('tabId') ? Number(params.get('tabId')) : null;

  const state = {
    tabId: null,
    windowId: null,
    url: '',
    title: '',
    settings: null,
    seed: 0,
    overrides: {}, // key -> { type?, profile?, salt? }
    rows: [],
    filled: false,
    busy: false,
  };

  // ---- Helpers ------------------------------------------------------------------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('data-')) node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el('textarea', { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Copied');
  }

  function typeSelect(selected) {
    const select = el('select', { class: 'type', title: 'Data type' });
    const groups = {};
    for (const t of G.TYPE_LIST) {
      if (!groups[t.group]) groups[t.group] = select.appendChild(el('optgroup', { label: t.group }));
      groups[t.group].append(el('option', { value: t.id, text: t.label, selected: t.id === selected }));
    }
    return select;
  }

  const typeLabel = (id) => (G.TYPE_LIST.find((t) => t.id === id) || { label: id }).label;

  // ---- Settings controls -------------------------------------------------------

  function renderSeg(id, value) {
    for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.value === value));
  }

  function renderSettings() {
    renderSeg('region', state.settings.region);
    renderSeg('profile', state.settings.profile);
    $('seed').value = String(state.seed);
    $('seed-lock').checked = state.settings.seedLocked;
    $('gen-region').textContent = `Region: ${G.REGIONS[state.settings.region].label} · Seed: ${state.seed}`;
  }

  async function setSeed(seed) {
    state.seed = seed >>> 0;
    if (state.settings.seedLocked) state.settings = await R.saveSettings({ seed: state.seed });
    renderSettings();
  }

  // ---- Target tab ---------------------------------------------------------------

  async function currentTab() {
    if (pinnedTabId !== null) return chrome.tabs.get(pinnedTabId);
    const [tab] = await chrome.tabs.query({ active: true, windowId: state.windowId });
    return tab;
  }

  function showTarget() {
    let host = 'This tab';
    try { if (state.url) host = new URL(state.url).host || state.url; } catch { /* keep default */ }
    $('target-host').textContent = host;
    $('target-title').textContent = state.title || '';
  }

  function showNotice(result) {
    $('notice').hidden = false;
    $('grant').hidden = result.code !== 'no-permission';
    $('notice-text').textContent = result.code === 'no-permission'
      ? 'No access to this tab yet. Click the extension icon (Alt+Shift+B) on this page for one-time access, or allow it on all sites.'
      : result.message;
  }

  async function attach() {
    const tab = await currentTab().catch(() => null);
    if (!tab) return;
    state.tabId = tab.id;
    state.url = tab.url || '';
    state.title = tab.title || '';
    state.overrides = {};
    state.filled = false;
    showTarget();
    await run({ action: 'scan' });
  }

  // ---- Running commands -------------------------------------------------------------

  function setBusy(busy) {
    state.busy = busy;
    for (const id of ['fill', 'rescan', 'clear', 'reroll']) $(id).disabled = busy;
  }

  async function run(cmd) {
    if (state.tabId === null) return;
    setBusy(true);
    const full = Object.assign({ region: state.settings.region, profile: state.settings.profile, seed: state.seed, overrides: state.overrides }, cmd);
    const result = await R.runInTab(state.tabId, full);
    setBusy(false);
    applyResult(cmd.action, result, cmd.keys);
  }

  function applyResult(action, result, keys) {
    if (!result.ok) {
      showNotice(result);
      state.rows = [];
      renderRows();
      return;
    }
    $('notice').hidden = true;
    const top = result.frames.find((f) => f.top) || result.frames[0];
    if (top) {
      state.url = top.url;
      state.title = top.title;
      showTarget();
    }
    if (action === 'clear') {
      state.rows = state.rows.map((r) => Object.assign({}, r, { value: '', note: '', status: 'pending' }));
      state.filled = false;
      toast('Original values restored');
    } else if (keys) {
      const updated = new Map(result.fields.map((f) => [f.key, f]));
      state.rows = state.rows.map((r) => updated.get(r.key) || r);
    } else {
      state.rows = result.fields;
      if (action === 'fill') state.filled = true;
    }
    renderRows();
  }

  const fillAll = () => run({ action: 'fill' });
  const fillOne = (key) => run({ action: 'fill', keys: [key] });

  // ---- Rows -----------------------------------------------------------------------------

  function renderRows() {
    const list = $('rows');
    list.replaceChildren();
    for (const row of state.rows) list.append(renderRow(row));

    const filled = state.rows.filter((r) => r.status === 'filled').length;
    const skipped = state.rows.filter((r) => r.status === 'skipped').length;
    $('summary').textContent = state.rows.length
      ? `${state.rows.length} fields · ${filled} filled · ${skipped} skipped${state.filled ? ` · seed ${state.seed}` : ''}`
      : $('notice').hidden ? 'No form fields found on this page.' : '';
    $('export').hidden = !state.filled;
  }

  function renderRow(row) {
    const o = state.overrides[row.key] || {};
    const profile = row.profile || o.profile || state.settings.profile;
    const li = el('li', { class: 'row', 'data-key': row.key, 'data-profile': profile, 'data-status': row.status, 'data-testid': 'row' });

    const conf = el('span', { class: `conf ${row.detected.confidence}`, text: row.detected.confidence, title: `Detected ${typeLabel(row.detected.type)}: ${row.detected.reason}` });
    li.append(el('div', { class: 'row-head' }, el('span', { class: 'row-label', text: row.label, title: row.label }), conf));

    const type = typeSelect(row.type);
    if (o.type) type.classList.add('changed');
    type.addEventListener('change', () => {
      state.overrides[row.key] = Object.assign({}, o, { type: type.value === row.detected.type ? undefined : type.value });
      fillOne(row.key);
    });

    const prof = el('select', { class: 'prof', title: 'Profile for this field' },
      el('option', { value: '', text: 'Default' }),
      ...G.PROFILES.map((p) => el('option', { value: p, text: p[0].toUpperCase() + p.slice(1), selected: o.profile === p })));
    if (o.profile) prof.classList.add('changed');
    prof.addEventListener('change', () => {
      state.overrides[row.key] = Object.assign({}, o, { profile: prof.value || undefined });
      fillOne(row.key);
    });

    const again = el('button', { class: 'btn small', text: '↻', title: 'Another value for this field' });
    again.addEventListener('click', () => {
      state.overrides[row.key] = Object.assign({}, o, { salt: (o.salt || 0) + 1 });
      fillOne(row.key);
    });

    li.append(el('div', { class: 'row-ctl' }, type, prof, again));
    if (row.status === 'filled') li.append(el('div', { class: 'value', text: row.value === '' ? '(empty)' : row.value, title: row.value }));
    li.append(el('div', { class: 'note', text: row.status === 'skipped' ? `Skipped: ${row.note}` : row.note }));
    return li;
  }

  // ---- Export -------------------------------------------------------------------------------

  function evidence() {
    return {
      tool: `BFS Test Data Filler ${VERSION}`,
      generatedAt: new Date().toISOString(),
      page: { url: state.url, title: state.title },
      region: state.settings.region,
      profile: state.settings.profile,
      seed: state.seed,
      fields: state.rows.map((r) => ({ label: r.label, type: r.type, detectedType: r.detected.type, profile: r.profile, status: r.status, value: r.value, note: r.note })),
    };
  }

  function markdown() {
    const e = evidence();
    const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const lines = [
      `**Test data** – ${cell(e.page.title)} (${cell(e.page.url)})`,
      `Region ${e.region} · profile ${e.profile} · seed ${e.seed} · ${e.generatedAt}`,
      '',
      '| Field | Type | Profile | Value | Note |',
      '|---|---|---|---|---|',
      ...e.fields.map((f) => `| ${cell(f.label)} | ${cell(typeLabel(f.type))} | ${f.profile || ''} | \`${cell(f.value)}\` | ${cell(f.note)} |`),
    ];
    return lines.join('\n');
  }

  // ---- Generate tab -----------------------------------------------------------------------

  let generated = [];
  function runGenerator() {
    const type = $('gen-type').value;
    const profile = $('gen-profile').value;
    const count = Math.min(50, Math.max(1, Number($('gen-count').value) || 5));
    generated = Array.from({ length: count }, (_, i) =>
      G.generate(type, { profile, region: state.settings.region, seed: state.seed + i, key: `quick:${i}` }));
    const list = $('gen-results');
    list.replaceChildren();
    for (const g of generated) {
      const btn = el('button', { class: 'btn small', text: 'Copy' });
      btn.addEventListener('click', () => copy(g.value));
      list.append(el('li', { 'data-profile': profile }, el('div', { class: 'value', text: g.value === '' ? '(empty)' : g.value }), el('div', { class: 'note', text: g.note }), btn));
    }
  }

  // ---- Wiring ----------------------------------------------------------------------------------

  function wire() {
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      tab.addEventListener('click', () => {
        for (const t of document.querySelectorAll('[role="tab"]')) t.setAttribute('aria-selected', String(t === tab));
        for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    }

    $('region').addEventListener('click', async (e) => {
      const v = e.target.closest('button')?.dataset.value;
      if (!v || v === state.settings.region) return;
      state.settings = await R.saveSettings({ region: v });
      renderSettings();
      await run({ action: state.filled ? 'fill' : 'scan' });
    });

    $('profile').addEventListener('click', async (e) => {
      const v = e.target.closest('button')?.dataset.value;
      if (!v || v === state.settings.profile) return;
      state.settings = await R.saveSettings({ profile: v });
      renderSettings();
      renderRows();
    });

    $('seed').addEventListener('change', () => setSeed(Number($('seed').value.replace(/\D/g, '')) || 0));
    $('seed-lock').addEventListener('change', async () => {
      state.settings = await R.saveSettings({ seedLocked: $('seed-lock').checked, seed: state.seed });
    });
    $('reroll').addEventListener('click', async () => {
      await setSeed(G.randomSeed());
      state.overrides = Object.fromEntries(Object.entries(state.overrides).map(([k, v]) => [k, Object.assign({}, v, { salt: 0 })]));
      if (state.filled) await fillAll();
    });

    $('fill').addEventListener('click', fillAll);
    $('rescan').addEventListener('click', () => { state.overrides = {}; state.filled = false; run({ action: 'scan' }); });
    $('clear').addEventListener('click', () => run({ action: 'clear' }));
    $('retry').addEventListener('click', attach);
    $('grant').addEventListener('click', async () => {
      const granted = await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] }).catch(() => false);
      if (granted) attach();
    });

    $('copy-json').addEventListener('click', () => copy(JSON.stringify(evidence(), null, 2)));
    $('copy-md').addEventListener('click', () => copy(markdown()));

    const genType = $('gen-type');
    genType.replaceWith(Object.assign(typeSelect('cardNumber'), { id: 'gen-type' }));
    $('gen-run').addEventListener('click', runGenerator);
    $('gen-copy').addEventListener('click', () => copy(generated.map((g) => g.value).join('\n')));

    if (pinnedTabId === null) {
      chrome.tabs.onActivated.addListener(({ tabId, windowId }) => { if (windowId === state.windowId && tabId !== state.tabId) attach(); });
    }
    chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === state.tabId && info.status === 'complete') attach();
    });
    chrome.permissions.onAdded.addListener(() => attach());

    // Fills started from the context menu or keyboard shortcut.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'bfs:ran' || msg.tabId !== state.tabId) return;
      if (msg.action === 'fill') {
        state.seed = msg.seed;
        renderSettings();
      }
      applyResult(msg.action, msg.result);
    });
  }

  async function init() {
    state.settings = await R.getSettings();
    if (pinnedTabId === null) state.windowId = (await chrome.windows.getCurrent()).id;
    state.seed = state.settings.seedLocked && state.settings.seed !== null ? state.settings.seed : G.randomSeed();
    renderSettings();
    wire();
    await attach();
  }

  init();
})();
