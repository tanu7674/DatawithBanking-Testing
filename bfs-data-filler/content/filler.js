'use strict';

/**
 * Injected into each frame of the page under test (after lib/*.js).
 * Finds form fields, classifies them, fills them like a user would (so React/Angular/Vue
 * state updates), highlights what it filled and can restore the original values.
 */
(function () {
  if (globalThis.BFSFiller) return;

  const G = globalThis.BFSGenerators;
  const K = globalThis.BFSClassifier;
  const COLORS = { valid: '#16a34a', boundary: '#d97706', invalid: '#dc2626' };
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']);
  const frameToken = Math.random().toString(36).slice(2, 6);
  let counter = 0;
  const originals = new Map(); // key -> { els, values, checked }
  const highlighted = new Set();

  // ---- Discovery --------------------------------------------------------------

  function collect(root, out) {
    for (const el of root.querySelectorAll('*')) {
      if (el.matches('input, select, textarea')) out.push(el);
      if (el.shadowRoot) collect(el.shadowRoot, out);
    }
    return out;
  }

  function kindOf(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'text';
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (SKIP_TYPES.has(t)) return null;
    if (t === 'radio' || t === 'checkbox') return t;
    if (t === 'number') return 'number';
    if (t === 'date' || t === 'month') return 'date';
    return 'text';
  }

  function isVisible(el) {
    if (el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return true;
    // Custom-styled radios/checkboxes hide the input but show the label.
    const label = el.labels && el.labels[0];
    return !!(label && label.getClientRects().length);
  }

  /** Text of a node without the text of form controls inside it (a wrapping label would otherwise include every option). */
  function cleanText(node, exclude = []) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('select, option, input, textarea, script, style').forEach((n) => n.remove());
    let text = (clone.textContent || '').replace(/\s+/g, ' ');
    for (const e of exclude) text = text.replace(e, '');
    return text.replace(/\s+/g, ' ').trim();
  }

  function labelFor(el) {
    const parts = [];
    if (el.labels && el.labels.length) for (const l of el.labels) parts.push(cleanText(l));
    else if (el.closest('label')) parts.push(cleanText(el.closest('label')));
    const by = el.getAttribute('aria-labelledby');
    if (by) for (const id of by.split(/\s+/)) parts.push(cleanText(el.getRootNode().getElementById?.(id) || document.getElementById(id)));
    return parts.filter(Boolean).join(' ');
  }

  /** Radio groups rarely have one <label>: use the nearest legend or heading-like text around the group. */
  function groupLabel(radios) {
    const optionTexts = radios.map((r) => labelFor(r)).filter(Boolean);
    const fieldset = radios[0].closest('fieldset');
    let node = radios[0].parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      if (node === fieldset) break;
      const text = cleanText(node, optionTexts);
      if (text.length > 2) return text;
    }
    const legend = fieldset && fieldset.querySelector('legend');
    return legend ? cleanText(legend) : radios[0].name;
  }

  function describe(el, kind, label) {
    const attr = (n) => el.getAttribute(n) || '';
    return {
      kind,
      inputType: (attr('type') || (el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase(),
      name: attr('name'),
      id: el.id,
      autocomplete: attr('autocomplete'),
      placeholder: attr('placeholder'),
      ariaLabel: attr('aria-label'),
      label,
      testId: attr('data-testid') || attr('data-test-id') || attr('data-test') || attr('data-qa'),
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      min: attr('min'),
      max: attr('max'),
      step: attr('step'),
      required: el.required || attr('aria-required') === 'true',
    };
  }

  function keyFor(el) {
    if (!el.dataset.bfsKey) el.dataset.bfsKey = `${frameToken}-${++counter}`;
    return el.dataset.bfsKey;
  }

  function scanFields(region) {
    const fields = [];
    const radioGroups = new Map();
    collect(document, []).forEach((el, index) => {
      const kind = kindOf(el);
      if (!kind || !isVisible(el)) return;
      if (kind === 'radio') {
        const groupId = `${el.form ? 'f' : 'r'}:${el.name || `#${index}`}`;
        if (!radioGroups.has(groupId)) {
          const group = { kind, els: [], index };
          radioGroups.set(groupId, group);
          fields.push(group);
        }
        radioGroups.get(groupId).els.push(el);
        return;
      }
      fields.push({ kind, els: [el], index });
    });

    return fields.map((f) => {
      const el = f.els[0];
      const label = f.kind === 'radio' ? groupLabel(f.els) : labelFor(el);
      const desc = describe(el, f.kind, label);
      if (f.kind === 'radio') f.els.forEach((r) => (r.dataset.bfsKey = keyFor(el)));
      const display = (label || desc.ariaLabel || desc.placeholder || desc.name || desc.id || `${f.kind} field`).slice(0, 80);
      return Object.assign(f, {
        key: keyFor(el),
        stableId: desc.name || desc.id || label || `#${f.index}`,
        label: display,
        desc,
        disabled: f.els.every((e) => e.disabled || e.readOnly),
        detected: K.classify(desc, region),
      });
    });
  }

  // ---- Applying values like a user --------------------------------------------

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); // bypasses React's value tracker and maxlength
    fire(el);
  }

  function setChecked(el, checked) {
    if (el.checked === checked) return;
    if (checked) el.click();
    else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set.call(el, false);
      fire(el);
    }
  }

  function remember(field) {
    if (originals.has(field.key)) return;
    originals.set(field.key, { els: field.els, values: field.els.map((e) => e.value), checked: field.els.map((e) => e.checked) });
  }

  function highlight(field, profile) {
    for (const el of field.els) {
      const target = field.kind === 'radio' || field.kind === 'checkbox' ? el.closest('label') || el : el;
      if (!('bfsOutline' in target.dataset)) target.dataset.bfsOutline = target.style.outline;
      target.style.setProperty('outline', `2px solid ${COLORS[profile]}`, 'important');
      target.style.setProperty('outline-offset', '1px', 'important');
      highlighted.add(target);
    }
  }

  function unhighlightAll() {
    for (const t of highlighted) {
      t.style.outline = t.dataset.bfsOutline || '';
      t.style.removeProperty('outline-offset');
      delete t.dataset.bfsOutline;
    }
    highlighted.clear();
  }

  const isPlaceholderOption = (o) => o.value === '' || /^(select|choose|please|--)/i.test(o.text.trim());

  function pickOption(options, choice, rng) {
    if (!options.length) return null;
    if (choice === 'first') return options[0];
    if (choice === 'last') return options[options.length - 1];
    return rng.pick(options);
  }

  function applySelect(field, gen, rng) {
    const el = field.els[0];
    const options = [...el.options].filter((o) => !o.disabled);
    const real = options.filter((o) => !isPlaceholderOption(o));
    if (gen.choice === 'none') {
      const empty = options.find(isPlaceholderOption);
      if (empty) setNativeValue(el, empty.value);
      else { el.selectedIndex = -1; fire(el); }
      return { value: '(nothing selected)', note: gen.note };
    }
    if (!real.length) return { status: 'skipped', value: '', note: 'select has no options yet' };
    const wanted = [gen.value, ...(gen.alts || [])].filter(Boolean).map((v) => String(v).toLowerCase());
    let match = wanted.length ? real.find((o) => wanted.includes(o.value.toLowerCase()) || wanted.includes(o.text.trim().toLowerCase())) : null;
    let note = gen.note;
    if (!match) {
      match = pickOption(real, gen.choice || 'random', rng);
      if (wanted.length) note = `no option matches "${gen.value}" – ${gen.choice || 'random'} option used`;
    }
    setNativeValue(el, match.value);
    return { value: match.text.trim() || match.value, note };
  }

  function applyRadio(field, gen, rng) {
    if (gen.choice === 'none') {
      field.els.forEach((r) => setChecked(r, false));
      return { value: '(nothing selected)', note: gen.note };
    }
    const enabled = field.els.filter((r) => !r.disabled);
    const target = pickOption(enabled, gen.choice || 'random', rng);
    setChecked(target, true);
    return { value: labelFor(target) || target.value, note: gen.note };
  }

  // ---- Commands ---------------------------------------------------------------------

  function fill(cmd) {
    const region = cmd.region || 'US';
    const seed = cmd.seed;
    const overrides = cmd.overrides || {};
    const persona = G.createPersona(seed, region);
    const rows = [];

    for (const field of scanFields(region)) {
      if (cmd.keys && !cmd.keys.includes(field.key)) continue;
      const o = overrides[field.key] || {};
      const type = o.type || field.detected.type;
      const profile = o.profile || cmd.profile || 'valid';
      const row = { key: field.key, label: field.label, kind: field.kind, detected: field.detected, type, profile, value: '', note: '', status: 'filled' };

      if (field.disabled) {
        rows.push(Object.assign(row, { status: 'skipped', note: 'disabled or read-only' }));
        continue;
      }

      const rngKey = `${field.stableId}:${o.salt || 0}`;
      const gen = G.generate(type, {
        profile, region, seed, persona, key: rngKey,
        field: Object.assign({ labelText: field.label }, field.desc),
      });
      const rng = G.createRng(G.hashString(`${seed}:${rngKey}:pick`));
      remember(field);

      let applied;
      if (field.kind === 'select') applied = applySelect(field, gen, rng);
      else if (field.kind === 'radio') applied = applyRadio(field, gen, rng);
      else if (field.kind === 'checkbox') {
        const checked = typeof gen.checked === 'boolean' ? gen.checked : profile !== 'invalid';
        setChecked(field.els[0], checked);
        applied = { value: checked ? 'checked' : 'unchecked', note: gen.note };
      } else {
        setNativeValue(field.els[0], gen.value);
        applied = { value: gen.value, note: gen.note };
        if (field.els[0].value !== gen.value) {
          applied.note = `${applied.note ? `${applied.note}; ` : ''}page changed it to "${field.els[0].value}"`;
          applied.value = field.els[0].value;
        }
      }
      Object.assign(row, applied);
      if (row.status === 'filled') highlight(field, profile);
      rows.push(row);
    }
    return rows;
  }

  function clear() {
    for (const { els, values, checked } of originals.values()) {
      els.forEach((el, i) => {
        if (el.type === 'radio' || el.type === 'checkbox') setChecked(el, checked[i]);
        else if (el.value !== values[i]) setNativeValue(el, values[i]);
      });
    }
    const restored = originals.size;
    originals.clear();
    unhighlightAll();
    return restored;
  }

  globalThis.BFSFiller = {
    run(cmd) {
      const base = { url: location.href, title: document.title, top: window === window.top };
      if (cmd.action === 'scan') {
        const fields = scanFields(cmd.region || 'US').map((f) => ({
          key: f.key, label: f.label, kind: f.kind, detected: f.detected, type: f.detected.type, required: f.desc.required, status: f.disabled ? 'skipped' : 'pending',
        }));
        return Object.assign(base, { fields });
      }
      if (cmd.action === 'fill') return Object.assign(base, { fields: fill(cmd) });
      if (cmd.action === 'clear') return Object.assign(base, { restored: clear(), fields: [] });
      return Object.assign(base, { fields: [] });
    },
  };
})();
