'use strict';

/**
 * Synthetic BFS test data generators.
 *
 * Every data type has three profiles:
 *   valid    – passes format and checksum rules
 *   boundary – still valid, but sits on an edge that applications often get wrong
 *   invalid  – breaks exactly one rule, with a note saying which
 *
 * All randomness comes from a seeded RNG, so a seed reproduces the same data set.
 * Loaded as a classic script in the extension (globalThis.BFSGenerators) and with require() in Node.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const C = isNode ? require('./checksums.js') : root.BFSChecksums;
  const api = factory(C);
  if (isNode) module.exports = api;
  else root.BFSGenerators = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  // ---- Seeded randomness -----------------------------------------------------

  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** mulberry32: small, fast, good enough for test data. */
  function createRng(seed) {
    let a = Number(seed) >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min, max) => min + Math.floor(next() * (max - min + 1));
    const pick = (arr) => arr[int(0, arr.length - 1)];
    const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
    const letters = (n, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') =>
      Array.from({ length: n }, () => alphabet[int(0, alphabet.length - 1)]).join('');
    return { next, int, pick, digits, letters };
  }

  const randomSeed = () => Math.floor(Math.random() * 1e9);

  // ---- Reference data ---------------------------------------------------------

  const REGIONS = {
    US: { label: 'United States', country: 'United States', countryCode: 'US', countryAlts: ['US', 'USA', 'United States of America'] },
    IN: { label: 'India', country: 'India', countryCode: 'IN', countryAlts: ['IN', 'IND', 'Bharat'] },
    UK: { label: 'UK / Europe', country: 'United Kingdom', countryCode: 'GB', countryAlts: ['GB', 'UK', 'GBR', 'Great Britain'] },
  };

  const NAMES = {
    US: {
      first: ['James', 'Maria', 'Aaliyah', 'Wei', 'Carlos', 'Emily', 'Darnell', 'Priya', 'Noah', 'Sofia', 'Ethan', 'Grace'],
      last: ['Johnson', 'Garcia', 'Nguyen', 'Smith', 'Patel', 'Williams', 'Brown', 'Kim', 'Martinez', 'Okafor', 'Rossi', 'Cohen'],
    },
    IN: {
      first: ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Kavya', 'Arjun', 'Meera', 'Sanjay', 'Divya', 'Imran', 'Fatima'],
      last: ['Sharma', 'Iyer', 'Reddy', 'Patel', 'Gupta', 'Nair', 'Singh', 'Banerjee', 'Khan', 'Menon', 'Joshi', 'Rao'],
    },
    UK: {
      first: ['Oliver', 'Amelia', 'Harry', 'Isla', 'George', 'Ava', 'Mohammed', 'Freya', 'Jack', 'Chloe', 'Arjun', 'Niamh'],
      last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Thomas', 'Ahmed', 'Roberts', 'Walker', 'Hughes'],
    },
  };

  // [city, state code, state name, postal code]
  const PLACES = {
    US: [
      ['Springfield', 'IL', 'Illinois', '62704'], ['Austin', 'TX', 'Texas', '78701'], ['Denver', 'CO', 'Colorado', '80202'],
      ['Columbus', 'OH', 'Ohio', '43215'], ['Portland', 'OR', 'Oregon', '97205'], ['Raleigh', 'NC', 'North Carolina', '27601'],
      ['Phoenix', 'AZ', 'Arizona', '85004'], ['Boston', 'MA', 'Massachusetts', '02108'],
    ],
    IN: [
      ['Mumbai', 'MH', 'Maharashtra', '400001'], ['Bengaluru', 'KA', 'Karnataka', '560001'], ['Chennai', 'TN', 'Tamil Nadu', '600001'],
      ['Kolkata', 'WB', 'West Bengal', '700001'], ['Jaipur', 'RJ', 'Rajasthan', '302001'], ['Hyderabad', 'TG', 'Telangana', '500001'],
      ['Pune', 'MH', 'Maharashtra', '411001'], ['New Delhi', 'DL', 'Delhi', '110001'],
    ],
    UK: [
      ['London', 'ENG', 'England', 'EC1A 1BB'], ['Manchester', 'ENG', 'England', 'M1 1AE'], ['Birmingham', 'ENG', 'England', 'B33 8TH'],
      ['Croydon', 'ENG', 'England', 'CR2 6XH'], ['Edinburgh', 'SCT', 'Scotland', 'EH1 1YZ'], ['Cardiff', 'WLS', 'Wales', 'CF10 1EP'],
    ],
  };

  const STREETS = {
    US: { names: ['Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Washington', 'Lake', 'Hill'], suffixes: ['St', 'Ave', 'Blvd', 'Ln', 'Dr'] },
    IN: { names: ['MG Road', 'Link Road', 'Station Road', 'Park Street', 'Nehru Nagar', 'Gandhi Marg'], suffixes: [''] },
    UK: { names: ['High Street', 'Station Road', 'Church Lane', 'Victoria Road', 'Park Avenue', 'Mill Lane'], suffixes: [''] },
  };

  // GST state codes for the IN places above.
  const GST_STATE_CODES = { MH: '27', KA: '29', TN: '33', WB: '19', RJ: '08', TG: '36', DL: '07' };

  const CARD_BRANDS = {
    visa: { name: 'Visa', prefixes: ['4'], length: 16, cvv: 3 },
    mastercard: { name: 'Mastercard', prefixes: ['51', '52', '53', '54', '55', '2221', '2720'], length: 16, cvv: 3 },
    amex: { name: 'American Express', prefixes: ['34', '37'], length: 15, cvv: 4 },
    discover: { name: 'Discover', prefixes: ['6011', '65'], length: 16, cvv: 3 },
    rupay: { name: 'RuPay', prefixes: ['6521', '6522', '60'], length: 16, cvv: 3 },
  };
  const BRANDS_BY_REGION = { US: ['visa', 'mastercard', 'amex', 'discover'], IN: ['visa', 'mastercard', 'rupay'], UK: ['visa', 'mastercard', 'amex'] };

  const XSS_PROBE = '<script>alert(1)</script>';
  const SQL_PROBE = "x'); DROP TABLE users;--";

  // ---- Small helpers ------------------------------------------------------------

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ascii = (s) => s.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  /** Same calendar day n years earlier (29 Feb falls back to 28 Feb). */
  function yearsAgo(today, n) {
    const d = new Date(today.getFullYear() - n, today.getMonth(), today.getDate());
    if (d.getMonth() !== today.getMonth()) d.setDate(0);
    return d;
  }

  function dateStyle(ctx) {
    const f = ctx.field || {};
    if (f.inputType === 'date') return 'iso';
    const ph = (f.placeholder || '').toLowerCase();
    if (/y{4}-m{2}-d{2}/.test(ph)) return 'iso';
    if (/d{2}[/.-]m{2}/.test(ph)) return 'dmy';
    if (/m{2}[/.-]d{2}/.test(ph)) return 'mdy';
    return ctx.region === 'US' ? 'mdy' : 'dmy';
  }

  function formatDate(d, ctx) {
    const style = dateStyle(ctx);
    if (style === 'iso') return iso(d);
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    return style === 'mdy' ? `${mm}/${dd}/${d.getFullYear()}` : `${dd}/${mm}/${d.getFullYear()}`;
  }

  const impossibleDate = (ctx) => {
    const style = dateStyle(ctx);
    return style === 'iso' ? '1990-02-30' : style === 'mdy' ? '02/30/1990' : '30/02/1990';
  };

  const fieldMax = (ctx, fallback) => (ctx.field && ctx.field.maxLength > 0 ? ctx.field.maxLength : fallback);
  const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const allowsDecimals = (ctx) => {
    const f = ctx.field || {};
    if (f.inputType !== 'number') return true;
    return f.step === 'any' || (num(f.step) !== null && !Number.isInteger(num(f.step)));
  };
  const money = (v, ctx) => (allowsDecimals(ctx) ? v.toFixed(2) : String(Math.round(v)));
  const longText = (n, unit = 'Abcdefghij') => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const ok = (value, note = '', extra) => Object.assign({ value: String(value), note }, extra);

  function luhnNumber(rng, brandKey, length) {
    const brand = CARD_BRANDS[brandKey];
    let body = rng.pick(brand.prefixes);
    const len = length || brand.length;
    while (body.length < len - 1) body += String(rng.int(0, 9));
    return body + C.luhnCheckDigit(body);
  }

  const groupCard = (n) => (n.length === 15 ? `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}` : n.replace(/(\d{4})(?=\d)/g, '$1 '));
  const groupIban = (s) => s.replace(/(.{4})(?=.)/g, '$1 ');

  function makeIban(rng, country) {
    let bban;
    if (country === 'GB') bban = rng.pick(['NWBK', 'BARC', 'LOYD', 'HBUK', 'MIDL']) + rng.digits(14);
    else if (country === 'IE') bban = rng.pick(['AIBK', 'BOFI']) + rng.digits(14);
    else if (country === 'NL') bban = rng.pick(['ABNA', 'INGB', 'RABO']) + rng.digits(10);
    else bban = rng.digits(18); // DE: 8-digit bank code + 10-digit account
    return country + C.ibanCheckDigits(country, bban) + bban;
  }

  function makeAadhaar(rng, first) {
    const body = String(first || rng.int(2, 9)) + rng.digits(10);
    return body + C.verhoeffCheckDigit(body);
  }

  function makePan(rng, entity, surnameInitial) {
    return rng.letters(3) + entity + (surnameInitial || rng.letters(1)) + rng.digits(4) + rng.letters(1);
  }

  function makeAba(rng) {
    const prefix = pad(rng.pick([rng.int(1, 12), rng.int(21, 32)]));
    const first8 = prefix + rng.digits(6);
    return first8 + C.abaCheckDigit(first8);
  }

  function makeNi(rng) {
    for (;;) {
      const prefix = rng.letters(1, 'ABCEGHJKLMNOPRSTWXYZ') + rng.letters(1, 'ABCEGHJKLMNPRSTWXYZ');
      if (!C.NI_BAD_PREFIXES.includes(prefix)) return prefix + rng.digits(6) + rng.letters(1, 'ABCD');
    }
  }

  function makeSsn(rng) {
    let area = rng.int(1, 899);
    if (area === 666) area = 667;
    return `${pad(area, 3)}-${pad(rng.int(1, 99))}-${pad(rng.int(1, 9999), 4)}`;
  }

  // ---- Persona: one consistent applicant per fill -------------------------------

  function createPersona(seed, region = 'US', today = new Date()) {
    const rng = createRng(hashString(`persona:${seed}:${region}`));
    const names = NAMES[region] || NAMES.US;
    const firstName = rng.pick(names.first);
    const lastName = rng.pick(names.last);
    const [city, stateCode, stateName, postal] = rng.pick(PLACES[region] || PLACES.US);
    const street = STREETS[region] || STREETS.US;
    const streetName = `${rng.pick(street.names)} ${rng.pick(street.suffixes)}`.trim();
    const line1 = region === 'IN' ? `${rng.int(1, 250)}, ${streetName}` : `${rng.int(10, 9899)} ${streetName}`;
    const age = rng.int(24, 68);
    const dob = addDays(yearsAgo(startOfDay(today), age), -rng.int(0, 360));
    return {
      region, firstName, lastName, fullName: `${firstName} ${lastName}`,
      email: `${ascii(firstName)}.${ascii(lastName)}${rng.int(1, 99)}@example.com`,
      dob, age,
      address: { line1, city, stateCode, stateName, postal, ...REGIONS[region] },
      cardBrand: rng.pick(BRANDS_BY_REGION[region] || BRANDS_BY_REGION.US),
    };
  }

  // ---- Data types ------------------------------------------------------------------
  // Each type: { label, group, numeric?, valid(ctx) -> case, boundary: [ctx -> case], invalid: [ctx -> case] }
  // ctx = { rng, region, persona, field, today }

  const TYPES = {};
  const def = (id, spec) => { TYPES[id] = Object.assign({ id, numeric: false, boundary: [], invalid: [] }, spec); };

  const commonTextInvalid = [
    () => ok('', 'empty – required field left blank'),
    () => ok('   ', 'whitespace only – should be trimmed and rejected'),
    (ctx) => ok(longText(fieldMax(ctx, 255) + 1), `over max length (${fieldMax(ctx, 255) + 1} chars; maxlength bypassed)`),
    () => ok(XSS_PROBE, 'script injection probe – must be rejected or safely encoded'),
  ];

  // Personal
  def('firstName', {
    label: 'First name', group: 'Personal',
    valid: (c) => ok(c.persona.firstName),
    boundary: [
      () => ok('Mary-Jane', 'hyphenated name'),
      () => ok('Zoë', 'diacritic – often wrongly rejected'),
      () => ok('A', 'single letter (minimum length)'),
      () => ok('Jean Luc', 'space inside the name'),
      (c) => ok(longText(fieldMax(c, 50)), `exactly max length (${fieldMax(c, 50)})`),
    ],
    invalid: [() => ok('J4ne', 'contains a digit'), ...commonTextInvalid],
  });

  def('lastName', {
    label: 'Last name', group: 'Personal',
    valid: (c) => ok(c.persona.lastName),
    boundary: [
      () => ok("O'Brien", 'apostrophe – common SQL/escaping bug'),
      () => ok('Smith-Jones', 'double-barrelled'),
      () => ok('Nuñez', 'diacritic – often wrongly rejected'),
      () => ok('Ng', 'two letters'),
      () => ok('van der Berg', 'lower-case particle with spaces'),
      (c) => ok(longText(fieldMax(c, 50)), `exactly max length (${fieldMax(c, 50)})`),
    ],
    invalid: [() => ok('Sm1th', 'contains a digit'), ...commonTextInvalid],
  });

  def('fullName', {
    label: 'Full name', group: 'Personal',
    valid: (c) => ok(c.persona.fullName),
    boundary: [
      () => ok("Mary-Jane O'Brien", 'hyphen and apostrophe'),
      () => ok('José Nuñez', 'diacritics'),
      () => ok('Madonna', 'single name (mononym) – common in some countries'),
      (c) => ok(longText(fieldMax(c, 100)), `exactly max length (${fieldMax(c, 100)})`),
    ],
    invalid: [() => ok('John 3rd', 'contains a digit'), ...commonTextInvalid],
  });

  def('email', {
    label: 'Email', group: 'Personal',
    valid: (c) => ok(c.persona.email, 'example.com is reserved for testing (RFC 2606)'),
    boundary: [
      (c) => ok(`${ascii(c.persona.firstName)}+test@example.com`, 'plus addressing – valid but often rejected'),
      () => ok("o'brien@example.com", 'apostrophe in local part – valid'),
      (c) => ok(c.persona.email.toUpperCase(), 'upper case – should be matched case-insensitively'),
      (c) => ok(`${ascii(c.persona.firstName)}@mail.example.org`, 'subdomain'),
      () => ok(`${'a'.repeat(64)}@example.com`, 'local part at the 64-character maximum'),
    ],
    invalid: [
      () => ok('jane.doe@', 'missing domain'),
      () => ok('jane.doe.example.com', 'missing @'),
      () => ok('jane doe@example.com', 'space in local part'),
      () => ok('jane@@example.com', 'double @'),
      () => ok('jane.doe@example', 'no top-level domain'),
      () => ok('.jane@example.com', 'leading dot'),
      () => ok(`${'a'.repeat(65)}@example.com`, 'local part over 64 characters'),
      () => ok('', 'empty – required field left blank'),
    ],
  });

  const PHONE = {
    US: {
      valid: (c) => {
        const area = c.rng.pick(['201', '212', '312', '415', '512', '617', '702', '713', '919']);
        const line = `01${c.rng.digits(2)}`;
        return ok(`(${area}) 555-${line}`, 'fictional 555-01xx range', { compact: `${area}555${line}` });
      },
      boundary: [
        () => ok('+1 212 555 0100', 'with country code'),
        () => ok('212.555.0199', 'dot separators'),
        () => ok('2125550100', 'digits only'),
      ],
      invalid: [
        () => ok('555-0123', '7 digits – no area code'),
        () => ok('(212) 555-012', '9 digits'),
        () => ok('(012) 555-0123', 'area code cannot start with 0 or 1'),
        () => ok('abc-def-ghij', 'letters'),
        () => ok('+44 20 7946 0958', 'foreign (UK) number'),
      ],
    },
    IN: {
      valid: (c) => ok(`${c.rng.pick(['98', '97', '99', '91', '88', '70', '63'])}${c.rng.digits(8)}`, '10-digit mobile starting 6–9'),
      boundary: [
        (c) => ok(`+91 ${c.rng.pick(['98', '97'])}${c.rng.digits(8)}`, 'with +91 country code'),
        (c) => ok(`09${c.rng.digits(9)}`, 'leading 0 trunk prefix'),
        () => ok('6000000000', 'lowest mobile series (starts with 6)'),
      ],
      invalid: [
        (c) => ok(`5${c.rng.digits(9)}`, 'starts with 5 – not a mobile series'),
        (c) => ok(`98${c.rng.digits(7)}`, '9 digits'),
        (c) => ok(`98${c.rng.digits(9)}`, '11 digits'),
        () => ok('98765abcde', 'letters'),
      ],
    },
    UK: {
      valid: (c) => ok(`07700 900${c.rng.digits(3)}`, 'Ofcom drama range 07700 900xxx (never issued)', { compact: `07700900${c.rng.digits(3)}` }),
      boundary: [
        (c) => ok(`+44 7700 900${c.rng.digits(3)}`, 'international format'),
        () => ok('07700900000', 'no spaces, lowest drama number'),
      ],
      invalid: [
        () => ok('0770090012', '10 digits'),
        () => ok('+44 07700 900123', 'redundant 0 after +44'),
        () => ok('7700 900123', 'missing leading 0'),
        () => ok('07700 9001ab', 'letters'),
      ],
    },
  };

  def('phone', {
    label: 'Phone / mobile', group: 'Personal',
    valid: (c) => (PHONE[c.region] || PHONE.US).valid(c),
    boundary: [(c) => c.rng.pick((PHONE[c.region] || PHONE.US).boundary)(c)],
    invalid: [(c) => c.rng.pick((PHONE[c.region] || PHONE.US).invalid)(c), () => ok('', 'empty – required field left blank')],
  });

  def('dob', {
    label: 'Date of birth', group: 'Personal',
    valid: (c) => ok(formatDate(c.persona.dob, c), `age ${c.persona.age}`),
    boundary: [
      (c) => ok(formatDate(yearsAgo(c.today, 18), c), 'turns 18 today – minimum adult age'),
      (c) => ok(formatDate(addDays(yearsAgo(c.today, 18), -1), c), '18 years and 1 day'),
      (c) => ok(formatDate(yearsAgo(c.today, 100), c), 'exactly 100 years old'),
      (c) => ok(formatDate(new Date(2000, 1, 29), c), 'born on a leap day (29 Feb 2000)'),
    ],
    invalid: [
      (c) => ok(formatDate(addDays(c.today, 1), c), 'date in the future'),
      (c) => ok(formatDate(addDays(yearsAgo(c.today, 18), 1), c), 'turns 18 tomorrow – under age'),
      (c) => ok(formatDate(c.today, c), 'born today'),
      (c) => ok(impossibleDate(c), 'impossible calendar date (30 Feb)'),
      () => ok('', 'empty – required field left blank'),
    ],
  });

  const strongPassword = (rng, n) => {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*'];
    const chars = sets.map((s) => rng.letters(1, s));
    while (chars.length < n) chars.push(rng.letters(1, sets.join('')));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  };

  def('password', {
    label: 'Password', group: 'Personal',
    valid: (c) => ok(strongPassword(c.rng, 14), '14 chars: upper, lower, digit, symbol'),
    boundary: [
      (c) => ok(strongPassword(c.rng, 8), 'exactly 8 characters (common minimum)'),
      (c) => ok(strongPassword(c.rng, 64), '64 characters'),
      () => ok('Pass word 1!', 'contains a space'),
    ],
    invalid: [
      () => ok('password', 'common password'),
      () => ok('12345678', 'digits only'),
      () => ok('Ab1!', 'too short (4)'),
      () => ok('abcdefgh', 'no upper case, digit or symbol'),
      () => ok('', 'empty'),
    ],
  });

  def('otp', {
    label: 'OTP / verification code', group: 'Personal', numeric: true,
    valid: (c) => ok(c.rng.digits(6), '6-digit code'),
    boundary: [() => ok('000000', 'all zeros'), () => ok('999999', 'all nines')],
    invalid: [() => ok('12345', '5 digits'), () => ok('1234567', '7 digits'), () => ok('12a456', 'contains a letter'), () => ok('', 'empty')],
  });

  // Address
  def('addressLine1', {
    label: 'Address line 1', group: 'Address',
    valid: (c) => ok(c.persona.address.line1),
    boundary: [
      () => ok('#12, 3rd Cross, 4th Main', 'special characters # and ,'),
      () => ok('P.O. Box 1234', 'PO Box – some products forbid it'),
      () => ok('Hauptstraße 5', 'non-ASCII character'),
      (c) => ok(longText(fieldMax(c, 100)), `exactly max length (${fieldMax(c, 100)})`),
    ],
    invalid: commonTextInvalid,
  });

  def('addressLine2', {
    label: 'Address line 2', group: 'Address',
    valid: (c) => ok(c.region === 'IN' ? `Flat ${c.rng.int(101, 1204)}, Tower ${c.rng.pick(['A', 'B', 'C'])}` : c.region === 'UK' ? `Flat ${c.rng.int(1, 40)}` : `Apt ${c.rng.int(1, 30)}${c.rng.pick(['A', 'B', 'C'])}`),
    boundary: [() => ok('', 'empty – optional field'), (c) => ok(longText(fieldMax(c, 100)), `exactly max length (${fieldMax(c, 100)})`)],
    invalid: [(c) => ok(longText(fieldMax(c, 255) + 1), 'over max length'), () => ok(XSS_PROBE, 'script injection probe')],
  });

  const CITY_EDGES = {
    US: [["Coeur d'Alene", 'apostrophe'], ['Winston-Salem', 'hyphen'], ['St. Louis', 'abbreviation with dot']],
    IN: [['Thiruvananthapuram', 'long city name (18)'], ['Navi Mumbai', 'space']],
    UK: [['Stoke-on-Trent', 'hyphens'], ['Llanfairpwllgwyngyll', 'long city name (20)']],
  };

  def('city', {
    label: 'City', group: 'Address',
    valid: (c) => ok(c.persona.address.city),
    boundary: [(c) => { const [v, n] = c.rng.pick(CITY_EDGES[c.region] || CITY_EDGES.US); return ok(v, n); }],
    invalid: [() => ok('12345', 'digits only'), ...commonTextInvalid],
  });

  const STATE_EDGES = {
    US: [['DC', 'District of Columbia', 'not a state, but a valid jurisdiction'], ['AK', 'Alaska', 'non-contiguous state'], ['HI', 'Hawaii', 'non-contiguous state']],
    IN: [['DL', 'Delhi', 'union territory'], ['LA', 'Ladakh', 'newest union territory (2019)']],
    UK: [['NIR', 'Northern Ireland', 'separate jurisdiction'], ['SCT', 'Scotland', 'separate jurisdiction']],
  };

  def('state', {
    label: 'State / province', group: 'Address',
    valid: (c) => ok(c.persona.address.stateCode, '', { alts: [c.persona.address.stateName] }),
    boundary: [(c) => { const [code, name, note] = c.rng.pick(STATE_EDGES[c.region] || STATE_EDGES.US); return ok(code, note, { alts: [name] }); }],
    invalid: [() => ok('XX', 'not a real state code', { choice: 'none' }), () => ok('', 'empty – nothing selected', { choice: 'none' })],
  });

  const POSTAL = {
    US: {
      boundary: [
        (c) => ok(`${c.persona.address.postal}-${c.rng.digits(4)}`, 'ZIP+4'),
        () => ok('00501', 'lowest ZIP in use (leading zeros must be kept)'),
        () => ok('99950', 'highest ZIP in use'),
      ],
      invalid: [() => ok('1234', '4 digits'), () => ok('123456', '6 digits'), () => ok('ABCDE', 'letters'), () => ok('00000', 'all zeros')],
    },
    IN: {
      boundary: [() => ok('110001', 'New Delhi GPO'), () => ok('400 001', 'space inside PIN – should be normalised')],
      invalid: [() => ok('012345', 'PIN cannot start with 0'), () => ok('12345', '5 digits'), () => ok('9999999', '7 digits')],
    },
    UK: {
      boundary: [() => ok('EC1A1BB', 'no space'), () => ok('m1 1ae', 'lower case'), () => ok('GIR 0AA', 'special non-geographic postcode')],
      invalid: [() => ok('12345', 'US-style digits'), () => ok('EC1A 1B', 'incomplete inward code'), () => ok('E!1A 1BB', 'symbol')],
    },
  };

  def('postalCode', {
    label: 'ZIP / PIN / postcode', group: 'Address',
    valid: (c) => ok(c.persona.address.postal),
    boundary: [(c) => c.rng.pick((POSTAL[c.region] || POSTAL.US).boundary)(c)],
    invalid: [(c) => c.rng.pick((POSTAL[c.region] || POSTAL.US).invalid)(c), () => ok('', 'empty – required field left blank')],
  });

  def('country', {
    label: 'Country', group: 'Address',
    valid: (c) => ok(c.persona.address.country, '', { alts: c.persona.address.countryAlts.concat(c.persona.address.countryCode) }),
    boundary: [(c) => ok(c.persona.address.countryCode, 'ISO 3166 code instead of name', { alts: [c.persona.address.country] })],
    invalid: [() => ok('Atlantis', 'not a country', { choice: 'none' }), () => ok('', 'empty', { choice: 'none' })],
  });

  // United States
  def('ssn', {
    label: 'SSN', group: 'United States',
    valid: (c) => ok(makeSsn(c.rng), 'valid format; synthetic – use only in test environments'),
    boundary: [
      () => ok('001-01-0001', 'lowest valid area, group and serial'),
      () => ok('899-99-9999', 'highest valid area'),
      () => ok('667-01-0001', 'first area after the excluded 666'),
      (c) => ok(makeSsn(c.rng).replace(/-/g, ''), 'digits only, no dashes'),
    ],
    invalid: [
      () => ok('000-12-3456', 'area 000 is never issued'),
      () => ok('666-12-3456', 'area 666 is never issued'),
      () => ok('912-34-5678', 'area 9xx is the ITIN range, not SSN'),
      () => ok('123-00-4567', 'group 00 is never issued'),
      () => ok('123-45-0000', 'serial 0000 is never issued'),
      () => ok('123-45-678', '8 digits'),
      () => ok('078-05-1120', 'the 1938 "wallet" SSN – publicly voided'),
    ],
  });

  def('routingNumber', {
    label: 'ABA routing number', group: 'United States', numeric: true,
    valid: (c) => ok(makeAba(c.rng), 'ABA checksum valid (synthetic)'),
    boundary: [
      () => ok('011000015', 'Federal Reserve Bank of Boston (published)'),
      () => ok('021000021', 'JPMorgan Chase, New York (published)'),
    ],
    invalid: [
      (c) => { const r = makeAba(c.rng); return ok(r.slice(0, 8) + ((Number(r[8]) + 1) % 10), 'checksum digit wrong'); },
      (c) => ok(makeAba(c.rng).slice(0, 8), '8 digits'),
      (c) => { const b = `13${c.rng.digits(6)}`; return ok(b + C.abaCheckDigit(b), 'prefix 13 is not a Federal Reserve district'); },
    ],
  });

  // India
  def('pan', {
    label: 'PAN', group: 'India',
    valid: (c) => ok(makePan(c.rng, 'P', c.persona.lastName[0].toUpperCase()), 'individual PAN format (4th char P, 5th = surname initial)'),
    boundary: [
      (c) => ok(makePan(c.rng, 'C'), 'company PAN (4th char C)'),
      (c) => ok(makePan(c.rng, 'P', c.persona.lastName[0].toUpperCase()).toLowerCase(), 'lower case – should be normalised'),
    ],
    invalid: [
      (c) => ok(makePan(c.rng, 'P').slice(0, 9), '9 characters'),
      (c) => ok(`${c.rng.letters(3)}X${c.rng.letters(1)}${c.rng.digits(4)}${c.rng.letters(1)}`, '4th character X is not a valid holder type'),
      (c) => ok(`1${makePan(c.rng, 'P').slice(1)}`, 'starts with a digit'),
      (c) => ok(`${makePan(c.rng, 'P').slice(0, 9)}5`, 'ends with a digit'),
    ],
  });

  def('aadhaar', {
    label: 'Aadhaar', group: 'India', numeric: true,
    valid: (c) => { const a = makeAadhaar(c.rng); return ok(a.replace(/(\d{4})(?=\d)/g, '$1 '), 'Verhoeff checksum valid (synthetic)', { compact: a }); },
    boundary: [(c) => ok(makeAadhaar(c.rng), 'no spaces'), (c) => ok(makeAadhaar(c.rng, 2), 'lowest leading digit (2)')],
    invalid: [
      (c) => { const a = makeAadhaar(c.rng); return ok(a.slice(0, 11) + ((Number(a[11]) + 1) % 10), 'Verhoeff checksum wrong'); },
      (c) => { const body = `1${c.rng.digits(10)}`; return ok(body + C.verhoeffCheckDigit(body), 'starts with 1 – never issued'); },
      (c) => ok(makeAadhaar(c.rng).slice(0, 11), '11 digits'),
    ],
  });

  const IFSC_BANKS = ['SBIN', 'HDFC', 'ICIC', 'UTIB', 'PUNB', 'KKBK', 'BARB', 'CNRB'];
  def('ifsc', {
    label: 'IFSC', group: 'India',
    valid: (c) => ok(`${c.rng.pick(IFSC_BANKS)}0${c.rng.digits(6)}`, 'format valid; branch may not exist in the RBI list'),
    boundary: [
      (c) => ok(`${c.rng.pick(IFSC_BANKS)}0${c.rng.letters(3)}${c.rng.digits(3)}`, 'letters in the branch code'),
      (c) => ok(`${c.rng.pick(IFSC_BANKS)}0${c.rng.digits(6)}`.toLowerCase(), 'lower case – should be normalised'),
    ],
    invalid: [
      (c) => ok(`${c.rng.pick(IFSC_BANKS)}1${c.rng.digits(6)}`, '5th character must be 0'),
      (c) => ok(`${c.rng.pick(IFSC_BANKS)}0${c.rng.digits(5)}`, '10 characters'),
      (c) => ok(`SB1N0${c.rng.digits(6)}`, 'digit in the bank code'),
    ],
  });

  function makeGstin(c, entity = '1') {
    const state = GST_STATE_CODES[c.persona.address.stateCode] || '27';
    const first14 = `${state}${makePan(c.rng, 'P', c.persona.lastName[0].toUpperCase())}${entity}Z`;
    return first14 + C.gstinCheckChar(first14);
  }

  def('gstin', {
    label: 'GSTIN', group: 'India',
    valid: (c) => ok(makeGstin(c), 'checksum valid; state code matches the address'),
    boundary: [(c) => ok(makeGstin(c, '2'), 'second registration in the same state'), (c) => ok(makeGstin(c, 'A'), 'entity code A (10th registration)')],
    invalid: [
      (c) => { const g = makeGstin(c); const wrong = g[14] === 'A' ? 'B' : 'A'; return ok(g.slice(0, 14) + wrong, 'check character wrong'); },
      (c) => { const g = makeGstin(c); return ok(`${g.slice(0, 13)}Y${g[14]}`, '14th character must be Z'); },
      (c) => ok(`99${makeGstin(c).slice(2)}`, 'state code 99 does not exist'),
      (c) => ok(makeGstin(c).slice(0, 14), '14 characters'),
    ],
  });

  def('upi', {
    label: 'UPI ID (VPA)', group: 'India',
    valid: (c) => ok(`${ascii(c.persona.firstName)}.${ascii(c.persona.lastName)}@ok${c.rng.pick(['axis', 'hdfcbank', 'icici', 'sbi'])}`),
    boundary: [(c) => ok(`9${c.rng.digits(9)}@ybl`, 'mobile-number handle'), (c) => ok(`${ascii(c.persona.firstName)}_${c.rng.digits(2)}@upi`, 'underscore and digits')],
    invalid: [
      (c) => ok(`${ascii(c.persona.firstName)}.${ascii(c.persona.lastName)}`, 'missing @handle'),
      (c) => ok(`${ascii(c.persona.firstName)} ${ascii(c.persona.lastName)}@okaxis`, 'space'),
      () => ok('@okaxis', 'empty user part'),
      (c) => ok(`${ascii(c.persona.firstName)}@`, 'missing PSP handle'),
    ],
  });

  // UK / Europe
  def('iban', {
    label: 'IBAN', group: 'UK / Europe',
    valid: (c) => {
      const country = c.region === 'UK' ? c.rng.pick(['GB', 'GB', 'DE', 'NL', 'IE']) : 'GB';
      const iban = makeIban(c.rng, country);
      return ok(groupIban(iban), `${country} IBAN, mod-97 valid (synthetic)`, { compact: iban });
    },
    boundary: [
      (c) => ok(makeIban(c.rng, 'GB'), 'no spaces (electronic format)'),
      (c) => ok(groupIban(makeIban(c.rng, 'NL')), 'shortest common length (NL, 18)'),
      (c) => ok(makeIban(c.rng, 'DE').toLowerCase(), 'lower case – should be normalised'),
    ],
    invalid: [
      (c) => { const i = makeIban(c.rng, 'GB'); const cd = pad((Number(i.slice(2, 4)) + 1) % 100); return ok(groupIban(i.slice(0, 2) + cd + i.slice(4)), 'check digits wrong (mod-97 fails)'); },
      (c) => ok(makeIban(c.rng, 'GB').slice(0, 21), 'wrong length for GB (21, needs 22)'),
      (c) => ok(`XX${makeIban(c.rng, 'GB').slice(2)}`, 'unknown country code XX'),
    ],
  });

  const BIC_BY_REGION = {
    US: [['CHAS', 'US', '33'], ['BOFA', 'US', '3N'], ['CITI', 'US', '33']],
    IN: [['SBIN', 'IN', 'BB'], ['HDFC', 'IN', 'BB'], ['ICIC', 'IN', 'BB']],
    UK: [['NWBK', 'GB', '2L'], ['BARC', 'GB', '22'], ['DEUT', 'DE', 'FF'], ['ABNA', 'NL', '2A']],
  };

  def('bic', {
    label: 'BIC / SWIFT', group: 'UK / Europe',
    valid: (c) => { const [bank, cc, loc] = c.rng.pick(BIC_BY_REGION[c.region] || BIC_BY_REGION.UK); return ok(bank + cc + loc, 'format valid (8 characters)'); },
    boundary: [
      (c) => { const [bank, cc] = c.rng.pick(BIC_BY_REGION[c.region] || BIC_BY_REGION.UK); return ok(`${bank}${cc}20`, 'test & training BIC (location ends in 0)'); },
      (c) => { const [bank, cc, loc] = c.rng.pick(BIC_BY_REGION[c.region] || BIC_BY_REGION.UK); return ok(`${bank}${cc}${loc}XXX`, '11 characters with primary-office branch XXX'); },
    ],
    invalid: [
      () => ok('NWBKGB2', '7 characters'),
      () => ok('NWB1GB2L', 'digit in the bank code'),
      () => ok('NWBKGB2LX', '9 characters'),
      () => ok('NWBKGB1L', 'location code cannot start with 1'),
    ],
  });

  def('sortCode', {
    label: 'Sort code', group: 'UK / Europe',
    valid: (c) => { const d = `${c.rng.int(10, 99)}${c.rng.digits(4)}`; return ok(`${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`, 'format only – UK modulus check not applied', { compact: d }); },
    boundary: [(c) => ok(`${c.rng.int(10, 99)}${c.rng.digits(4)}`, 'digits only'), (c) => ok(`${c.rng.int(10, 99)} ${c.rng.digits(2)} ${c.rng.digits(2)}`, 'space separators')],
    invalid: [() => ok('12-34-5', '5 digits'), () => ok('12-34-567', '7 digits'), () => ok('AB-CD-EF', 'letters')],
  });

  def('niNumber', {
    label: 'National Insurance no.', group: 'UK / Europe',
    valid: (c) => ok(makeNi(c.rng), 'HMRC prefix and suffix rules'),
    boundary: [
      (c) => ok(makeNi(c.rng).replace(/^(..)(..)(..)(..)(.)$/, '$1 $2 $3 $4 $5'), 'with spaces'),
      (c) => ok(makeNi(c.rng).toLowerCase(), 'lower case – should be normalised'),
    ],
    invalid: [
      () => ok('QQ123456C', 'QQ prefix is for examples only – never issued'),
      () => ok('GB123456A', 'prefix GB is never issued'),
      () => ok('AB123456E', 'suffix must be A–D'),
      () => ok('DA123456A', 'first letter D is not allowed'),
      () => ok('AB12345C', '5 digits'),
    ],
  });

  // Cards
  const brandOf = (c) => CARD_BRANDS[c.persona.cardBrand];
  def('cardNumber', {
    label: 'Card number', group: 'Cards', numeric: true,
    valid: (c) => { const n = luhnNumber(c.rng, c.persona.cardBrand); return ok(groupCard(n), `Luhn-valid ${brandOf(c).name} (synthetic – use gateway sandbox cards for authorisations)`, { compact: n }); },
    boundary: [
      (c) => { const n = luhnNumber(c.rng, 'amex'); return ok(groupCard(n), 'American Express: 15 digits, 4-6-5 grouping', { compact: n }); },
      (c) => ok(luhnNumber(c.rng, 'visa', 19), 'Visa at maximum PAN length (19)'),
      (c) => ok(luhnNumber(c.rng, c.persona.cardBrand), 'digits only, no spaces'),
      (c) => ok(luhnNumber(c.rng, 'mastercard').replace(/(\d{4})(?=\d)/g, '$1-'), 'dash separators'),
    ],
    invalid: [
      (c) => { const n = luhnNumber(c.rng, c.persona.cardBrand); return ok(n.slice(0, -1) + ((Number(n.slice(-1)) + 1) % 10), 'Luhn check fails'); },
      (c) => ok(luhnNumber(c.rng, 'visa', 15), 'Luhn-valid but wrong length for Visa (15)'),
      () => ok('0000000000000000', 'passes Luhn but no issuer uses it'),
      (c) => ok(luhnNumber(c.rng, 'visa', 12), '12 digits'),
      (c) => ok(`${luhnNumber(c.rng, 'visa').slice(0, 15)}A`, 'contains a letter'),
    ],
  });

  function expiry(c, monthsAhead) {
    const d = new Date(c.today.getFullYear(), c.today.getMonth() + monthsAhead, 1);
    if (c.field && c.field.inputType === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const fullYear = /y{4}/i.test((c.field && c.field.placeholder) || '');
    return `${pad(d.getMonth() + 1)}/${fullYear ? d.getFullYear() : pad(d.getFullYear() % 100)}`;
  }

  def('cardExpiry', {
    label: 'Card expiry (MM/YY)', group: 'Cards',
    valid: (c) => ok(expiry(c, c.rng.int(12, 48))),
    boundary: [(c) => ok(expiry(c, 0), 'expires this month – still valid'), (c) => ok(expiry(c, 120), '10 years ahead')],
    invalid: [
      (c) => ok(expiry(c, -1), 'expired last month'),
      (c) => ok(`13/${pad((c.today.getFullYear() + 2) % 100)}`, 'month 13'),
      (c) => ok(`00/${pad((c.today.getFullYear() + 2) % 100)}`, 'month 00'),
    ],
  });

  def('cardExpMonth', {
    label: 'Card expiry month', group: 'Cards', numeric: true,
    valid: (c) => { const m = c.rng.int(1, 12); return ok(pad(m), '', { alts: [String(m)] }); },
    boundary: [() => ok('01', 'January', { alts: ['1'] }), () => ok('12', 'December')],
    invalid: [() => ok('13', 'month 13', { choice: 'none' }), () => ok('00', 'month 00', { choice: 'none' })],
  });

  def('cardExpYear', {
    label: 'Card expiry year', group: 'Cards', numeric: true,
    valid: (c) => { const y = c.today.getFullYear() + c.rng.int(1, 5); return ok(y, '', { alts: [pad(y % 100)] }); },
    boundary: [(c) => ok(c.today.getFullYear(), 'current year', { alts: [pad(c.today.getFullYear() % 100)] })],
    invalid: [(c) => ok(c.today.getFullYear() - 1, 'last year – expired', { alts: [pad((c.today.getFullYear() - 1) % 100)], choice: 'none' })],
  });

  def('cardCvv', {
    label: 'CVV / CVC', group: 'Cards', numeric: true,
    valid: (c) => ok(c.rng.digits(brandOf(c).cvv), `${brandOf(c).cvv} digits for ${brandOf(c).name}`),
    boundary: [() => ok('000', 'all zeros'), () => ok('9999', '4 digits (American Express)')],
    invalid: [() => ok('12', '2 digits'), () => ok('12345', '5 digits'), () => ok('12a', 'contains a letter'), () => ok('', 'empty')],
  });

  def('cardHolder', {
    label: 'Name on card', group: 'Cards',
    valid: (c) => ok(c.persona.fullName.toUpperCase()),
    boundary: [() => ok('MARY-JANE OBRIEN-SMITHSON', '26 characters (typical embossing limit)'), () => ok("D'ARCY O'NEIL", 'apostrophes')],
    invalid: [() => ok('J0HN SM1TH', 'digits'), ...commonTextInvalid],
  });

  // Banking
  const ACCOUNT = {
    US: { valid: [10, 12], min: 4, max: 17 },
    IN: { valid: [11, 16], min: 9, max: 18 },
    UK: { valid: [8, 8], min: 8, max: 8 },
  };

  def('accountNumber', {
    label: 'Bank account number', group: 'Banking', numeric: true,
    valid: (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(`${c.rng.int(1, 9)}${c.rng.digits(c.rng.int(a.valid[0], a.valid[1]) - 1)}`, `${c.region} account number length`); },
    boundary: [
      (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(`${c.rng.int(1, 9)}${c.rng.digits(a.min - 1)}`, `minimum length (${a.min})`); },
      (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(`${c.rng.int(1, 9)}${c.rng.digits(a.max - 1)}`, `maximum length (${a.max})`); },
      (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(`0${c.rng.digits(a.valid[0] - 1)}`, 'leading zero – must be stored as text'); },
    ],
    invalid: [
      (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(`${c.rng.int(1, 9)}${c.rng.digits(a.max)}`, `too long (${a.max + 1} digits)`); },
      (c) => { const a = ACCOUNT[c.region] || ACCOUNT.US; return ok(c.rng.digits(a.min - 1), `too short (${a.min - 1} digits)`); },
      () => ok('ABC12345', 'letters'),
      () => ok('', 'empty'),
    ],
  });

  function amountRange(c) {
    const label = ((c.field && c.field.labelText) || '').toLowerCase();
    if (/rent|mortgage|housing/.test(label)) return [800, 2200];
    if (/debt|emi|instal/.test(label)) return [50, 600];
    return [100, 5000];
  }

  def('amount', {
    label: 'Amount', group: 'Banking', numeric: true,
    valid: (c) => {
      const min = num(c.field && c.field.min);
      const max = num(c.field && c.field.max);
      let [lo, hi] = amountRange(c);
      lo = Math.max(lo, min ?? lo);
      hi = Math.min(hi, max ?? hi);
      if (lo > hi) [lo, hi] = [min ?? lo, max ?? lo * 10]; // the field's own range wins over our typical range
      return ok(money(lo + c.rng.next() * (hi - lo), c));
    },
    boundary: [
      (c) => ok(num(c.field && c.field.min) ?? 0, 'minimum (min attribute or 0)'),
      (c) => (allowsDecimals(c) ? ok('0.01', 'smallest positive amount') : ok('1', 'smallest positive whole amount')),
      (c) => (num(c.field && c.field.max) !== null ? ok(num(c.field.max), 'maximum (max attribute)') : ok(allowsDecimals(c) ? '999999999.99' : '999999999', 'very large amount')),
    ],
    invalid: [
      () => ok('-1', 'negative amount'),
      () => ok('12.345', 'three decimal places'),
      (c) => (num(c.field && c.field.max) !== null ? ok(num(c.field.max) + 1, 'above the max attribute') : ok('-0.01', 'negative by one cent')),
      () => ok('1,000', 'thousands separator'),
      () => ok('abc', 'not a number'),
    ],
  });

  const INCOME = { US: [85000, 180000, 1000], IN: [600000, 3600000, 10000], UK: [32000, 120000, 1000] };
  def('income', {
    label: 'Annual income', group: 'Banking', numeric: true,
    valid: (c) => { const [lo, hi, step] = INCOME[c.region] || INCOME.US; return ok(Math.round((lo + c.rng.next() * (hi - lo)) / step) * step); },
    boundary: [() => ok('0', 'zero income – valid input, should hit a business rule'), () => ok('9999999', 'very high income')],
    invalid: [() => ok('-50000', 'negative income'), () => ok('abc', 'not a number'), () => ok('', 'empty')],
  });

  function scoreRange(c) {
    const min = num(c.field && c.field.min) ?? 300;
    const max = num(c.field && c.field.max) ?? (c.region === 'IN' ? 900 : 850);
    return [min, max];
  }

  def('creditScore', {
    label: 'Credit score', group: 'Banking', numeric: true,
    valid: (c) => { const [min, max] = scoreRange(c); return ok(c.rng.int(Math.max(min, 700), max - 20), 'good-credit applicant'); },
    boundary: [(c) => ok(scoreRange(c)[0], 'lowest possible score'), (c) => ok(scoreRange(c)[1], 'highest possible score')],
    invalid: [
      (c) => ok(scoreRange(c)[0] - 1, 'one below the minimum'),
      (c) => ok(scoreRange(c)[1] + 1, 'one above the maximum'),
      () => ok('720.5', 'decimal score'),
      () => ok('abc', 'not a number'),
    ],
  });

  def('interestRate', {
    label: 'Interest rate (%)', group: 'Banking', numeric: true,
    valid: (c) => ok((6.5 + c.rng.next() * 18).toFixed(2)),
    boundary: [() => ok('0', '0% (promotional)'), () => ok('0.01', 'smallest positive rate'), () => ok('36', '36% – a common rate cap')],
    invalid: [() => ok('-1', 'negative rate'), () => ok('101', 'over 100%'), () => ok('12.345', 'three decimal places'), () => ok('abc', 'not a number')],
  });

  def('tenure', {
    label: 'Loan tenure (months)', group: 'Banking', numeric: true,
    valid: (c) => ok(c.rng.pick([12, 24, 36, 48, 60, 84])),
    boundary: [(c) => ok(num(c.field && c.field.min) ?? 1, 'minimum tenure'), (c) => ok(num(c.field && c.field.max) ?? 360, 'maximum tenure (30 years)')],
    invalid: [() => ok('0', 'zero months'), () => ok('-12', 'negative'), () => ok('12.5', 'fractional months')],
  });

  // Generic
  def('text', {
    label: 'Text (generic)', group: 'Generic',
    valid: (c) => ok(`Test ${c.rng.pick(['alpha', 'bravo', 'charlie', 'delta', 'echo'])} ${c.rng.int(1, 999)}`),
    boundary: [
      (c) => ok(longText(fieldMax(c, 255)), `exactly max length (${fieldMax(c, 255)})`),
      () => ok('x', 'single character'),
      () => ok('Ünïcödé ✓ ₹ € £', 'non-ASCII and currency symbols'),
    ],
    invalid: [...commonTextInvalid, () => ok(SQL_PROBE, 'SQL injection probe – must be handled safely')],
  });

  function numberRange(c) {
    return [num(c.field && c.field.min), num(c.field && c.field.max)];
  }

  def('number', {
    label: 'Number (generic)', group: 'Generic', numeric: true,
    valid: (c) => { const [min, max] = numberRange(c); return ok(c.rng.int(min ?? 1, max ?? Math.max((min ?? 1) + 99, 100))); },
    boundary: [(c) => ok(numberRange(c)[0] ?? 0, 'minimum'), (c) => ok(numberRange(c)[1] ?? 999999, 'maximum')],
    invalid: [
      (c) => ok((numberRange(c)[0] ?? 0) - 1, 'below the minimum'),
      (c) => (numberRange(c)[1] !== null ? ok(numberRange(c)[1] + 1, 'above the maximum') : ok('1.5', 'decimal where a whole number is expected')),
      () => ok('abc', 'not a number'),
    ],
  });

  def('date', {
    label: 'Date (generic)', group: 'Generic',
    valid: (c) => ok(formatDate(addDays(c.today, c.rng.int(1, 30)), c), 'within the next 30 days'),
    boundary: [(c) => ok(formatDate(c.today, c), 'today'), (c) => ok(formatDate(new Date(c.today.getFullYear(), 11, 31), c), 'last day of the year')],
    invalid: [(c) => ok(formatDate(addDays(c.today, -1), c), 'yesterday – invalid for future-dated fields'), (c) => ok(impossibleDate(c), 'impossible calendar date'), () => ok('', 'empty')],
  });

  def('choice', {
    label: 'Choice (select / radio)', group: 'Generic',
    valid: () => ({ value: '', choice: 'random', note: 'random option' }),
    boundary: [() => ({ value: '', choice: 'first', note: 'first option' }), () => ({ value: '', choice: 'last', note: 'last option' })],
    invalid: [() => ({ value: '', choice: 'none', note: 'nothing selected' })],
  });

  def('consent', {
    label: 'Consent checkbox', group: 'Generic',
    valid: () => ({ value: 'checked', checked: true, note: 'consent given' }),
    boundary: [() => ({ value: 'checked', checked: true, note: 'consent given' })],
    invalid: [() => ({ value: 'unchecked', checked: false, note: 'consent not given – submission must be blocked' })],
  });

  def('checkbox', {
    label: 'Checkbox (generic)', group: 'Generic',
    valid: (c) => { const v = c.rng.next() < 0.5; return { value: v ? 'checked' : 'unchecked', checked: v, note: '' }; },
    boundary: [() => ({ value: 'checked', checked: true, note: 'checked' }), () => ({ value: 'unchecked', checked: false, note: 'unchecked' })],
    invalid: [() => ({ value: 'unchecked', checked: false, note: 'unchecked' })],
  });

  // ---- generate() -----------------------------------------------------------------

  const PROFILES = ['valid', 'boundary', 'invalid'];

  function acceptable(kase, field) {
    if (!field || typeof kase.value !== 'string' || kase.choice || 'checked' in kase) return true;
    if (kase.value === '') return true;
    if (field.inputType === 'number') return /^-?\d+(\.\d+)?$/.test(kase.value);
    if (field.inputType === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(kase.value) && !Number.isNaN(new Date(kase.value).getTime()) && new Date(`${kase.value}T00:00:00Z`).toISOString().startsWith(kase.value);
    if (field.inputType === 'month') return /^\d{4}-\d{2}$/.test(kase.value);
    return true;
  }

  function fitToField(kase, field) {
    const out = Object.assign({}, kase);
    if (!field) return out;
    const candidates = [out.value, out.compact, String(out.value).replace(/[\s().-]/g, '')].filter((v) => v !== undefined);
    if (field.inputType === 'number') {
      const numeric = candidates.find((v) => /^-?\d+(\.\d+)?$/.test(v));
      if (numeric !== undefined) out.value = numeric;
    }
    if (field.maxLength > 0 && out.value.length > field.maxLength) {
      const fits = candidates.find((v) => v.length <= field.maxLength);
      if (fits !== undefined) out.value = fits;
      else {
        out.value = out.value.slice(0, field.maxLength);
        out.note = `${out.note ? `${out.note}; ` : ''}truncated to maxlength ${field.maxLength}`;
      }
    }
    return out;
  }

  /**
   * Generate one value.
   * opts: { profile, region, seed, key, persona, field, today }
   *   key keeps per-field randomness independent, so changing one field does not reshuffle the others.
   */
  function generate(type, opts = {}) {
    const spec = TYPES[type] || TYPES.text;
    const profile = PROFILES.includes(opts.profile) ? opts.profile : 'valid';
    const region = REGIONS[opts.region] ? opts.region : 'US';
    const seed = opts.seed ?? randomSeed();
    const today = startOfDay(opts.today || new Date());
    const ctx = {
      rng: createRng(hashString(`${seed}:${opts.key || type}:${type}:${profile}`)),
      region,
      persona: opts.persona || createPersona(seed, region, today),
      field: opts.field || null,
      today,
    };

    const makers = profile === 'valid' ? [spec.valid] : spec[profile].length ? spec[profile] : [spec.valid];
    let cases = makers.map((m) => m(ctx)).filter((k) => acceptable(k, ctx.field));
    if (!cases.length) cases = [ok('', `no ${profile} value fits a ${ctx.field.inputType} input – left empty`)];
    let kase = ctx.rng.pick(cases);
    if (profile !== 'invalid') kase = fitToField(kase, ctx.field);
    return { type: spec.id, profile, value: kase.value, note: kase.note || '', alts: kase.alts || [], choice: kase.choice, checked: kase.checked };
  }

  const TYPE_LIST = Object.values(TYPES).map(({ id, label, group }) => ({ id, label, group }));

  return { createRng, hashString, randomSeed, createPersona, generate, formatDate, REGIONS, PROFILES, TYPES, TYPE_LIST, CARD_BRANDS };
});
