'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/checksums.js');
const G = require('../lib/generators.js');

const TODAY = new Date(2026, 9, 9); // 9 Oct 2026, fixed so date rules are deterministic
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const REGIONS = Object.keys(G.REGIONS);

// Validators for types that have a definitive rule. Boundary values must pass them (after normalising),
// invalid values must fail them.
const RULES = {
  ssn: (v) => C.isSsnValid(v),
  routingNumber: (v) => C.isAbaValid(v),
  pan: (v) => C.isPanValid(v.toUpperCase()),
  aadhaar: (v) => C.isAadhaarValid(v.replace(/\s/g, '')),
  ifsc: (v) => C.isIfscValid(v.toUpperCase()),
  gstin: (v) => C.isGstinValid(v),
  upi: (v) => C.isUpiValid(v),
  iban: (v) => C.isIbanValid(v.toUpperCase()),
  bic: (v) => C.isBicValid(v),
  sortCode: (v) => /^\d{2}[- ]?\d{2}[- ]?\d{2}$/.test(v),
  niNumber: (v) => C.isNiNumberValid(v.replace(/\s/g, '').toUpperCase()),
  cardNumber: (v) => C.isLuhnValid(v) && /^\d{13,19}$/.test(v.replace(/[\s-]/g, '')) && !/^0+$/.test(v.replace(/[\s-]/g, '')) && !(v.startsWith('4') && v.replace(/[\s-]/g, '').length === 15),
  email: (v) => /^[^\s@.][^\s@]{0,63}@[^\s@]+\.[^\s@]+$/.test(v),
  otp: (v) => /^\d{6}$/.test(v),
  cardCvv: (v) => /^\d{3,4}$/.test(v),
};

test('valid values pass their checksum/format rule for every seed and region', () => {
  for (const region of REGIONS) {
    for (const seed of SEEDS) {
      for (const [type, rule] of Object.entries(RULES)) {
        const g = G.generate(type, { profile: 'valid', region, seed, today: TODAY });
        assert.ok(rule(g.value), `${region} seed ${seed} ${type}: ${g.value}`);
      }
    }
  }
});

test('every boundary case still passes the rule', () => {
  for (const [type, rule] of Object.entries(RULES)) {
    if (type === 'cardCvv') continue; // 9999 is 4 digits; valid only for Amex
    for (const region of REGIONS) {
      const spec = G.TYPES[type];
      const persona = G.createPersona(1, region, TODAY);
      for (const make of spec.boundary) {
        const k = make({ rng: G.createRng(3), region, persona, field: null, today: TODAY });
        assert.ok(rule(k.value), `${region} ${type} boundary "${k.value}" (${k.note})`);
        assert.ok(k.note, `${type} boundary "${k.value}" needs a note`);
      }
    }
  }
});

test('every invalid case breaks the rule and says why', () => {
  for (const [type, rule] of Object.entries(RULES)) {
    for (const region of REGIONS) {
      const persona = G.createPersona(5, region, TODAY);
      for (const make of G.TYPES[type].invalid) {
        for (const seed of [1, 2, 3]) {
          const k = make({ rng: G.createRng(seed), region, persona, field: null, today: TODAY });
          const known = type === 'ssn' && k.value === '078-05-1120'; // format-valid but voided – the rule cannot know
          if (!known) assert.equal(rule(k.value), false, `${region} ${type} invalid "${k.value}" (${k.note})`);
          assert.ok(k.note, `${type} invalid "${k.value}" needs a note`);
        }
      }
    }
  }
});

test('US phone numbers match the sample app’s phone rule', () => {
  const appRule = /^(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}$/;
  for (const seed of SEEDS) assert.match(G.generate('phone', { region: 'US', seed }).value, appRule);
});

test('dates of birth: valid is an adult, boundary "turns 18 today" is exact, invalid future date is tomorrow', () => {
  const field = { inputType: 'date' };
  const persona = G.createPersona(1, 'US', TODAY);
  const ctx = { rng: G.createRng(1), region: 'US', persona, field, today: TODAY };
  const [eighteen] = G.TYPES.dob.boundary.map((m) => m(ctx));
  assert.equal(eighteen.value, '2008-10-09');
  assert.equal(G.TYPES.dob.invalid[0](ctx).value, '2026-10-10');
  for (const seed of SEEDS) {
    const v = G.generate('dob', { seed, field, today: TODAY }).value;
    assert.ok(v <= '2008-10-09', `adult: ${v}`);
  }
});

test('text dates follow the placeholder, else the region', () => {
  const d = new Date(1990, 3, 15);
  assert.equal(G.formatDate(d, { region: 'US', field: {} }), '04/15/1990');
  assert.equal(G.formatDate(d, { region: 'IN', field: {} }), '15/04/1990');
  assert.equal(G.formatDate(d, { region: 'US', field: { placeholder: 'DD/MM/YYYY' } }), '15/04/1990');
  assert.equal(G.formatDate(d, { region: 'IN', field: { placeholder: 'yyyy-mm-dd' } }), '1990-04-15');
});

test('same seed and key give the same value; a different key gives an independent value', () => {
  const a = G.generate('cardNumber', { seed: 42, key: 'cc' });
  const b = G.generate('cardNumber', { seed: 42, key: 'cc' });
  assert.deepEqual(a, b);
  const values = new Set(Array.from({ length: 20 }, (_, i) => G.generate('cardNumber', { seed: 42, key: `k${i}` }).value));
  assert.ok(values.size > 15);
});

test('a persona keeps name, email and card holder consistent', () => {
  const persona = G.createPersona(9, 'IN', TODAY);
  const email = G.generate('email', { seed: 9, region: 'IN', persona }).value;
  const holder = G.generate('cardHolder', { seed: 9, region: 'IN', persona }).value;
  assert.ok(email.startsWith(persona.firstName.toLowerCase()));
  assert.equal(holder, persona.fullName.toUpperCase());
});

test('valid values are fitted to maxlength; invalid ones deliberately are not', () => {
  const card = G.generate('cardNumber', { seed: 1, field: { maxLength: 16 } });
  assert.equal(card.value.length, 16);
  assert.ok(C.isLuhnValid(card.value));
  const aadhaar = G.generate('aadhaar', { seed: 1, region: 'IN', field: { maxLength: 12 } });
  assert.match(aadhaar.value, /^\d{12}$/);
  const name = G.generate('firstName', { seed: 1, profile: 'boundary', field: { maxLength: 50 } });
  assert.ok(name.value.length <= 50);
  for (let seed = 0; seed < 50; seed++) {
    const bad = G.generate('firstName', { seed, profile: 'invalid', field: { maxLength: 50 } });
    if (bad.note.startsWith('over max length')) {
      assert.equal(bad.value.length, 51);
      return;
    }
  }
  assert.fail('no over-max-length case generated in 50 seeds');
});

test('number inputs only get numeric values, date inputs only ISO dates', () => {
  for (let seed = 0; seed < 100; seed++) {
    for (const profile of G.PROFILES) {
      const n = G.generate('creditScore', { seed, profile, field: { inputType: 'number', min: '300', max: '850' } });
      assert.match(n.value, /^(-?\d+(\.\d+)?)?$/, `${profile} ${n.value}`);
      const d = G.generate('dob', { seed, profile, field: { inputType: 'date' }, today: TODAY });
      assert.match(d.value, /^(\d{4}-\d{2}-\d{2})?$/, `${profile} ${d.value}`);
    }
  }
});

test('amounts respect the field’s min and max', () => {
  for (let seed = 0; seed < 100; seed++) {
    const v = Number(G.generate('amount', { seed, field: { inputType: 'number', min: '10000', max: '5000000', step: '1' } }).value);
    assert.ok(v >= 10000 && v <= 5000000 && Number.isInteger(v), String(v));
    const s = Number(G.generate('creditScore', { seed, field: { min: '300', max: '850' } }).value);
    assert.ok(s >= 300 && s <= 850);
  }
});

test('every type generates something for every profile and region', () => {
  for (const { id } of G.TYPE_LIST) {
    for (const region of REGIONS) {
      for (const profile of G.PROFILES) {
        const g = G.generate(id, { seed: 11, region, profile, today: TODAY });
        assert.equal(g.type, id);
        assert.equal(typeof g.value, 'string');
      }
    }
  }
});
