'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const card = require('../src/card');

const utc = (iso) => new Date(`${iso}T12:00:00Z`);

describe('luhnCheckDigit', () => {
  it('returns 3 for the textbook example 7992739871', () => {
    assert.equal(card.luhnCheckDigit('7992739871'), '3');
  });
  it('returns 9 for dummy BIN body 400000123456789', () => {
    assert.equal(card.luhnCheckDigit('400000123456789'), '9');
  });
  it('returns 2 for all-zero body 400000000000000', () => {
    assert.equal(card.luhnCheckDigit('400000000000000'), '2');
  });
  it('returns 0 when the digit sum is already a multiple of 10 (empty input)', () => {
    assert.equal(card.luhnCheckDigit(''), '0');
  });
  it('always returns a single digit string', () => {
    for (const p of ['1', '12', '999999999999999', '0000']) assert.match(card.luhnCheckDigit(p), /^\d$/);
  });
});

describe('isLuhnValid', () => {
  it('accepts a valid number given as a string', () => {
    assert.equal(card.isLuhnValid('79927398713'), true);
  });
  it('accepts a valid number given as a JS number', () => {
    assert.equal(card.isLuhnValid(79927398713), true);
  });
  it('ignores spaces and dashes in a formatted card number', () => {
    assert.equal(card.isLuhnValid('4000 0012 3456 7899'), true);
    assert.equal(card.isLuhnValid('4000-0012-3456-7899'), true);
  });
  it('rejects a number whose last digit is off by one', () => {
    assert.equal(card.isLuhnValid('79927398710'), false);
    assert.equal(card.isLuhnValid('4000001234567898'), false);
  });
  it('rejects a single digit (too short to have a check digit)', () => {
    assert.equal(card.isLuhnValid('0'), false);
  });
  it('rejects an empty string and a string with no digits', () => {
    assert.equal(card.isLuhnValid(''), false);
    assert.equal(card.isLuhnValid('abcd'), false);
  });
  it('accepts the shortest valid input "00" (2 digits)', () => {
    assert.equal(card.isLuhnValid('00'), true);
  });
});

describe('generateCardNumber', () => {
  it('builds BIN + 9 injected digits + check digit (random digits 1..9)', () => {
    const seq = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const calls = [];
    const n = card.generateCardNumber((max) => {
      calls.push(max);
      return seq[calls.length - 1];
    });
    assert.equal(n, '4000001234567899');
    assert.deepEqual(calls, Array(9).fill(10), 'randomInt is asked for a digit 0-9 exactly 9 times');
  });
  it('produces 4000000000000002 when every random digit is 0', () => {
    assert.equal(card.generateCardNumber(() => 0), '4000000000000002');
  });
  it('uses the real RNG by default: 16 digits, dummy BIN 400000, Luhn-valid', () => {
    for (let i = 0; i < 100; i++) {
      const n = card.generateCardNumber();
      assert.match(n, /^400000\d{10}$/);
      assert.ok(card.isLuhnValid(n), n);
    }
  });
  it('exposes the dummy BIN constant as 400000', () => {
    assert.equal(card.DUMMY_BIN, '400000');
  });
});

describe('formatCardNumber and maskCardNumber', () => {
  it('groups a 16-digit number into 4 blocks of 4', () => {
    assert.equal(card.formatCardNumber('4000001234567899'), '4000 0012 3456 7899');
  });
  it('does not add a trailing space', () => {
    assert.equal(card.formatCardNumber('12345678'), '1234 5678');
  });
  it('masks all but the last 4 digits', () => {
    assert.equal(card.maskCardNumber('4000001234567899'), '**** **** **** 7899');
  });
});

describe('expiryDate (MM/YY, 5 years after issue)', () => {
  it('Sep 2026 issue expires 09/31', () => {
    assert.equal(card.expiryDate(new Date('2026-09-29T15:00:00Z')), '09/31');
  });
  it('December issue keeps month 12 (no month rollover): Dec 2026 -> 12/31', () => {
    assert.equal(card.expiryDate(new Date('2026-12-31T23:59:59Z')), '12/31');
  });
  it('January issue right after New Year (UTC) -> 01/32', () => {
    assert.equal(card.expiryDate(new Date('2027-01-01T00:00:00Z')), '01/32');
  });
  it('pads single-digit month and year: Mar 2004 -> 03/09', () => {
    assert.equal(card.expiryDate(new Date('2004-03-10T00:00:00Z')), '03/09');
  });
  it('century rollover: Jun 2095 -> 06/00', () => {
    assert.equal(card.expiryDate(new Date('2095-06-15T00:00:00Z')), '06/00');
  });
  it('Feb 29 issue on a leap year -> 02/YY', () => {
    assert.equal(card.expiryDate(new Date('2028-02-29T10:00:00Z')), '02/33');
  });
});

describe('isBusinessDay', () => {
  it('Monday 2026-10-05 is a business day', () => {
    assert.equal(card.isBusinessDay(utc('2026-10-05')), true);
  });
  it('Saturday and Sunday are not business days', () => {
    assert.equal(card.isBusinessDay(utc('2026-10-03')), false);
    assert.equal(card.isBusinessDay(utc('2026-10-04')), false);
  });
  it('Columbus Day 2026-10-12 (Monday) is not a business day', () => {
    assert.equal(card.isBusinessDay(utc('2026-10-12')), false);
  });
  it('observed holidays are not business days (2026-07-03, 2027-12-24)', () => {
    assert.equal(card.isBusinessDay(utc('2026-07-03')), false);
    assert.equal(card.isBusinessDay(utc('2027-12-24')), false);
  });
  it('uses the UTC calendar date regardless of time of day', () => {
    assert.equal(card.isBusinessDay(new Date('2026-10-05T00:00:00Z')), true);
    assert.equal(card.isBusinessDay(new Date('2026-10-05T23:59:59Z')), true);
    assert.equal(card.isBusinessDay(new Date('2026-10-12T23:59:59Z')), false);
  });
  it('the day after a holiday is a business day (2026-10-13)', () => {
    assert.equal(card.isBusinessDay(utc('2026-10-13')), true);
  });
  it(
    'New Year 2028 observed on Friday 2027-12-31 is not a business day',
    () => {
      assert.equal(card.isBusinessDay(utc('2027-12-31')), false);
    },
  );
});

describe('addBusinessDays', () => {
  it('adding 0 days returns the same date at UTC midnight', () => {
    assert.equal(card.addBusinessDays(new Date('2026-09-29T15:30:00Z'), 0).toISOString(), '2026-09-29T00:00:00.000Z');
  });
  it('does not mutate the start date', () => {
    const start = new Date('2026-09-29T15:30:00Z');
    card.addBusinessDays(start, 5);
    assert.equal(start.toISOString(), '2026-09-29T15:30:00.000Z');
  });
  it('Friday + 1 business day = Monday (skips weekend)', () => {
    assert.equal(card.addBusinessDays(utc('2026-10-02'), 1).toISOString().slice(0, 10), '2026-10-05');
  });
  it('Wednesday before Thanksgiving + 1 = Friday 2026-11-27', () => {
    assert.equal(card.addBusinessDays(utc('2026-11-25'), 1).toISOString().slice(0, 10), '2026-11-27');
  });
  it('Christmas Eve 2026 + 1 skips Christmas (Fri) and the weekend = Mon 2026-12-28', () => {
    assert.equal(card.addBusinessDays(utc('2026-12-24'), 1).toISOString().slice(0, 10), '2026-12-28');
  });
  it('year rollover: 2026-12-31 + 1 skips New Year (Fri) and weekend = Mon 2027-01-04', () => {
    assert.equal(card.addBusinessDays(utc('2026-12-31'), 1).toISOString().slice(0, 10), '2027-01-04');
  });
  it('starting on a Saturday counts from Monday: 2026-10-03 + 1 = 2026-10-05', () => {
    assert.equal(card.addBusinessDays(utc('2026-10-03'), 1).toISOString().slice(0, 10), '2026-10-05');
  });
});

describe('estimateDelivery', () => {
  it('STANDARD from Tue 2026-09-29: 7-10 business days, skipping Columbus Day', () => {
    assert.deepEqual(card.estimateDelivery(new Date('2026-09-29T15:00:00Z'), 'STANDARD'), {
      method: 'STANDARD',
      carrier: 'USPS First-Class Mail',
      businessDays: '7-10',
      earliest: '2026-10-08',
      latest: '2026-10-14',
    });
  });
  it('EXPEDITED from Tue 2026-09-29: 2-3 business days (Thu/Fri)', () => {
    assert.deepEqual(card.estimateDelivery(new Date('2026-09-29T15:00:00Z'), 'EXPEDITED'), {
      method: 'EXPEDITED',
      carrier: 'Expedited (UPS 2nd Day)',
      businessDays: '2-3',
      earliest: '2026-10-01',
      latest: '2026-10-02',
    });
  });
  it('EXPEDITED approved on a Saturday: Tue 2026-10-06 to Wed 2026-10-07', () => {
    const d = card.estimateDelivery(utc('2026-10-03'), 'EXPEDITED');
    assert.equal(d.earliest, '2026-10-06');
    assert.equal(d.latest, '2026-10-07');
  });
  it('EXPEDITED approved on a holiday (Columbus Day 2026-10-12): Wed 10-14 to Thu 10-15', () => {
    const d = card.estimateDelivery(utc('2026-10-12'), 'EXPEDITED');
    assert.equal(d.earliest, '2026-10-14');
    assert.equal(d.latest, '2026-10-15');
  });
  it('EXPEDITED spanning observed Independence Day (Fri 2026-07-03) and weekend', () => {
    const d = card.estimateDelivery(utc('2026-07-02'), 'EXPEDITED');
    assert.equal(d.earliest, '2026-07-07');
    assert.equal(d.latest, '2026-07-08');
  });
  it('STANDARD spanning year end 2026 (Christmas and New Year)', () => {
    // Mon 12-21: 22,23,24 (3), skip 25-27, 28,29,30,31 (7) -> earliest 12-31; skip Jan 1-3, 4,5,6 (10) -> latest 2027-01-06
    const d = card.estimateDelivery(utc('2026-12-21'), 'STANDARD');
    assert.equal(d.earliest, '2026-12-31');
    assert.equal(d.latest, '2027-01-06');
  });
  it('unknown shipping method falls back to STANDARD', () => {
    const d = card.estimateDelivery(new Date('2026-09-29T15:00:00Z'), 'OVERNIGHT');
    assert.equal(d.method, 'STANDARD');
    assert.equal(d.carrier, 'USPS First-Class Mail');
    assert.equal(d.businessDays, '7-10');
    assert.equal(d.earliest, '2026-10-08');
  });
  it('missing shipping method falls back to STANDARD', () => {
    const d = card.estimateDelivery(new Date('2026-09-29T15:00:00Z'), undefined);
    assert.equal(d.method, 'STANDARD');
    assert.equal(d.latest, '2026-10-14');
  });
  it(
    'inherited object key "toString" as shipping method falls back to STANDARD',
    () => {
      const d = card.estimateDelivery(new Date('2026-09-29T15:00:00Z'), 'toString');
      assert.equal(d.method, 'STANDARD');
      assert.equal(d.earliest, '2026-10-08');
    },
  );
  it(
    'EXPEDITED from Wed 2027-12-29 skips observed New Year holiday Fri 2027-12-31',
    () => {
      const d = card.estimateDelivery(utc('2027-12-29'), 'EXPEDITED');
      assert.equal(d.earliest, '2028-01-03');
      assert.equal(d.latest, '2028-01-04');
    },
  );
  it('exposes shipping windows for STANDARD (7-10) and EXPEDITED (2-3)', () => {
    assert.deepEqual(card.SHIPPING_WINDOWS, {
      STANDARD: { label: 'USPS First-Class Mail', minDays: 7, maxDays: 10 },
      EXPEDITED: { label: 'Expedited (UPS 2nd Day)', minDays: 2, maxDays: 3 },
    });
  });
});
