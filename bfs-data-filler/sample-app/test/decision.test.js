'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateApplication, evaluate, calculateAge, creditLimitFor } = require('../src/decision');
const card = require('../src/card');

const TODAY = new Date('2026-09-29T15:00:00Z'); // a Tuesday

const valid = (overrides = {}) => ({
  cardProduct: 'CLASSIC',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-04-15',
  ssn: '123-45-6789',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
  addressLine1: '742 Evergreen Terrace',
  city: 'Springfield',
  state: 'IL',
  zip: '62704',
  housingStatus: 'RENT',
  monthlyHousingPayment: 1400,
  employmentStatus: 'EMPLOYED',
  annualIncome: 85000,
  monthlyDebtPayments: 350,
  creditScore: 725,
  bankruptcyLast7Years: false,
  shippingMethod: 'STANDARD',
  agreeToTerms: true,
  ...overrides,
});

test('valid application passes validation', () => {
  assert.deepEqual(validateApplication(valid(), TODAY), []);
});

test('validation catches bad fields', () => {
  const fields = (o) => validateApplication(valid(o), TODAY).map((e) => e.field);
  assert.deepEqual(fields({ ssn: '000-12-3456' }), ['ssn']);
  assert.deepEqual(fields({ ssn: '12345' }), ['ssn']);
  assert.deepEqual(fields({ zip: '1234' }), ['zip']);
  assert.deepEqual(fields({ state: 'XX' }), ['state']);
  assert.deepEqual(fields({ dateOfBirth: '2023-02-30' }), ['dateOfBirth']);
  assert.deepEqual(fields({ creditScore: 900 }), ['creditScore']);
  assert.deepEqual(fields({ agreeToTerms: false }), ['agreeToTerms']);
  assert.deepEqual(fields({ annualIncome: -1 }), ['annualIncome']);
  assert.deepEqual(fields({ cardProduct: 'toString' }), ['cardProduct']);
});

test('approves a qualified applicant', () => {
  const r = evaluate(valid(), TODAY);
  assert.equal(r.decision, 'APPROVED');
  assert.equal(r.creditLimit, 10000); // 12% of 85k = 10,200, capped at 10k
  assert.equal(r.apr, 24.99);
});

test('rejection rules', () => {
  const reject = (o) => {
    const r = evaluate(valid(o), TODAY);
    assert.equal(r.decision, 'REJECTED');
    return r.reasons;
  };
  assert.match(reject({ dateOfBirth: '2008-09-30' }).join(), /at least 18/);
  assert.match(reject({ creditScore: 579 }).join(), /Credit score/);
  assert.match(reject({ cardProduct: 'PLATINUM', creditScore: 739 }).join(), /Platinum/);
  assert.match(reject({ annualIncome: 11999 }).join(), /income/);
  assert.match(reject({ monthlyDebtPayments: 2000 }).join(), /Debt-to-income/);
  assert.match(reject({ bankruptcyLast7Years: true }).join(), /Bankruptcy/);
  assert.equal(reject({ creditScore: 500, bankruptcyLast7Years: true }).length, 2);
});

test('boundaries: exactly 18 today and score at product minimum are approved', () => {
  assert.equal(calculateAge(new Date('2008-09-29T00:00:00Z'), TODAY), 18);
  assert.equal(evaluate(valid({ dateOfBirth: '2008-09-29' }), TODAY).decision, 'APPROVED');
  assert.equal(evaluate(valid({ creditScore: 580 }), TODAY).decision, 'APPROVED');
  assert.equal(evaluate(valid({ cardProduct: 'PLATINUM', creditScore: 740 }), TODAY).decision, 'APPROVED');
});

test('credit limit has a $500 floor', () => {
  assert.equal(creditLimitFor(600, 12000), 700); // 6% of 12k = 720, rounded down to $100
  assert.equal(creditLimitFor(600, 5000), 500);
});

test('generated card numbers are 16 digits, Luhn-valid, and use the dummy BIN', () => {
  for (let i = 0; i < 50; i++) {
    const n = card.generateCardNumber();
    assert.match(n, /^400000\d{10}$/);
    assert.ok(card.isLuhnValid(n), n);
  }
  assert.ok(card.isLuhnValid('4111111111111111'));
  assert.ok(!card.isLuhnValid('4111111111111112'));
});

test('delivery skips weekends and federal holidays', () => {
  // Tue 2026-09-29 + 7 business days = Thu 2026-10-08; +10 skips Columbus Day (Mon 10-12) = Wed 2026-10-14.
  assert.deepEqual(
    [card.estimateDelivery(TODAY, 'STANDARD').earliest, card.estimateDelivery(TODAY, 'STANDARD').latest],
    ['2026-10-08', '2026-10-14'],
  );
  // Friday approval, expedited: Mon, Tue -> earliest Tue; latest Wed.
  const fri = new Date('2026-10-02T12:00:00Z');
  const exp = card.estimateDelivery(fri, 'EXPEDITED');
  assert.equal(exp.earliest, '2026-10-06');
  assert.equal(exp.latest, '2026-10-07');
});

test('expiry is 5 years out in MM/YY', () => {
  assert.equal(card.expiryDate(TODAY), '09/31');
});

// ---------------------------------------------------------------------------
// Extended coverage: equivalence classes, boundaries and decision tables
// ---------------------------------------------------------------------------

const { describe, it } = require('node:test');
const { aprFor, CARD_PRODUCTS, US_STATES, EMPLOYMENT_STATUSES, HOUSING_STATUSES, SHIPPING_METHODS } = require('../src/decision');

/** Returns the list of failing field names for a single-field override. */
const failingFields = (o) => validateApplication(valid(o), TODAY).map((e) => e.field);
const messagesFor = (o) => validateApplication(valid(o), TODAY).map((e) => e.message);

const ALL_REQUIRED = [
  'firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'ssn', 'addressLine1', 'city', 'state', 'zip',
  'housingStatus', 'monthlyHousingPayment', 'employmentStatus', 'annualIncome', 'monthlyDebtPayments',
  'creditScore', 'bankruptcyLast7Years', 'cardProduct', 'shippingMethod', 'agreeToTerms',
];

describe('validateApplication: request body', () => {
  for (const [label, body] of [['null', null], ['undefined', undefined], ['a string', 'hello'], ['a number', 42], ['true', true]]) {
    it(`returns a single "body" error when the body is ${label}`, () => {
      assert.deepEqual(validateApplication(body, TODAY), [{ field: 'body', message: 'Request body must be a JSON object' }]);
    });
  }
  it('empty object reports every required field (addressLine2 is optional)', () => {
    assert.deepEqual(validateApplication({}, TODAY).map((e) => e.field), ALL_REQUIRED);
  });
  it('uses the current date when "today" is omitted (DOB 1990 is valid on any date after 2008)', () => {
    assert.deepEqual(validateApplication(valid()), []);
  });
});

describe('validateApplication: names', () => {
  it('accepts letters, spaces, apostrophes and hyphens', () => {
    assert.deepEqual(failingFields({ firstName: 'Mary-Jane', lastName: "O'Neil Smith" }), []);
  });
  it('trims surrounding spaces before checking', () => {
    assert.deepEqual(failingFields({ firstName: '  Jane  ' }), []);
  });
  it('accepts a single letter (minimum length 1)', () => {
    assert.deepEqual(failingFields({ firstName: 'J', lastName: 'D' }), []);
  });
  it('accepts exactly 50 characters and rejects 51', () => {
    assert.deepEqual(failingFields({ firstName: 'A'.repeat(50) }), []);
    assert.deepEqual(failingFields({ firstName: 'A'.repeat(51) }), ['firstName']);
    assert.deepEqual(failingFields({ lastName: 'B'.repeat(50) }), []);
    assert.deepEqual(failingFields({ lastName: 'B'.repeat(51) }), ['lastName']);
  });
  it('rejects empty, blank, digits, symbols, leading hyphen and non-strings', () => {
    for (const v of ['', '   ', 'J4ne', 'Jane!', '-Jane', "'Jane", 123, null, undefined]) {
      assert.deepEqual(failingFields({ firstName: v }), ['firstName'], `firstName=${JSON.stringify(v)}`);
      assert.deepEqual(failingFields({ lastName: v }), ['lastName'], `lastName=${JSON.stringify(v)}`);
    }
  });
  it('uses the documented error message', () => {
    assert.deepEqual(messagesFor({ firstName: '' }), ['First name is required (letters only, max 50)']);
    assert.deepEqual(messagesFor({ lastName: '' }), ['Last name is required (letters only, max 50)']);
  });
});

describe('validateApplication: email', () => {
  it('accepts minimal and padded valid addresses', () => {
    for (const v of ['a@b.co', '  jane.doe+test@mail.example.com  ']) assert.deepEqual(failingFields({ email: v }), [], v);
  });
  it('rejects missing @, missing domain dot, spaces, double @ and non-strings', () => {
    for (const v of ['jane.example.com', 'jane@example', 'ja ne@example.com', 'jane@@example.com', '@example.com', '', 5, null]) {
      assert.deepEqual(failingFields({ email: v }), ['email'], String(v));
    }
  });
});

describe('validateApplication: phone', () => {
  it('accepts common 10-digit US formats', () => {
    for (const v of ['5551234567', '555-123-4567', '555.123.4567', '555 123 4567', '(555) 123-4567', '(555)123-4567']) {
      assert.deepEqual(failingFields({ phone: v }), [], v);
    }
  });
  it('rejects 9 digits, 11 digits, country code, letters and non-strings', () => {
    for (const v of ['555-123-456', '555-123-45678', '1-555-123-4567', '+1 555 123 4567', '555-ABC-4567', '', 5551234567]) {
      assert.deepEqual(failingFields({ phone: v }), ['phone'], String(v));
    }
  });
  it(
    'rejects unbalanced parentheses such as "(555-123-4567" and "555)123-4567"',
    () => {
      assert.deepEqual(failingFields({ phone: '(555-123-4567' }), ['phone']);
      assert.deepEqual(failingFields({ phone: '555)123-4567' }), ['phone']);
    },
  );
});

describe('validateApplication: date of birth', () => {
  it('accepts a leap-day birthday on a leap year (2000-02-29)', () => {
    assert.deepEqual(failingFields({ dateOfBirth: '2000-02-29' }), []);
  });
  it('rejects Feb 29 on a non-leap year and other impossible dates', () => {
    for (const v of ['2001-02-29', '1990-13-01', '1990-00-10', '1990-04-31', '1990-04-00']) {
      assert.deepEqual(failingFields({ dateOfBirth: v }), ['dateOfBirth'], v);
    }
  });
  it('rejects wrong formats and non-strings', () => {
    for (const v of ['1990-4-15', '04/15/1990', '1990/04/15', '19900415', '1990-04-15T00:00:00Z', '', null, 19900415]) {
      assert.deepEqual(messagesFor({ dateOfBirth: v }), ['Date of birth is required (YYYY-MM-DD)'], String(v));
    }
  });
  it('accepts a birth date equal to today (validation passes; underwriting rejects on age)', () => {
    assert.deepEqual(failingFields({ dateOfBirth: '2026-09-29' }), []);
  });
  it('rejects a birth date of tomorrow as "in the future"', () => {
    assert.deepEqual(messagesFor({ dateOfBirth: '2026-09-30' }), ['Date of birth cannot be in the future']);
  });
});

describe('validateApplication: SSN', () => {
  it('accepts with or without dashes and with surrounding spaces', () => {
    for (const v of ['123-45-6789', '123456789', ' 123-45-6789 ']) assert.deepEqual(failingFields({ ssn: v }), [], v);
  });
  it('accepts area numbers just outside the invalid ranges (001, 665, 667, 899)', () => {
    for (const v of ['001-45-6789', '665-45-6789', '667-45-6789', '899-45-6789']) assert.deepEqual(failingFields({ ssn: v }), [], v);
  });
  it('rejects never-issued numbers: area 000/666/9xx, group 00, serial 0000', () => {
    for (const v of ['000-45-6789', '666-45-6789', '900-45-6789', '999-45-6789', '123-00-6789', '123-45-0000']) {
      assert.deepEqual(messagesFor({ ssn: v }), ['SSN is not a valid issued number'], v);
    }
  });
  it('rejects wrong length, letters and non-strings with the format message', () => {
    for (const v of ['12345678', '1234567890', '12a-45-6789', '123 45 6789', '', 123456789, null]) {
      assert.deepEqual(messagesFor({ ssn: v }), ['SSN must be 9 digits (###-##-####)'], String(v));
    }
  });
});

describe('validateApplication: address', () => {
  it('requires street address and city (blank strings rejected)', () => {
    assert.deepEqual(failingFields({ addressLine1: '   ' }), ['addressLine1']);
    assert.deepEqual(failingFields({ addressLine1: undefined }), ['addressLine1']);
    assert.deepEqual(failingFields({ city: '' }), ['city']);
    assert.deepEqual(failingFields({ city: 42 }), ['city']);
  });
  it('accepts every one of the 50 states plus DC, case-insensitively and padded', () => {
    assert.equal(US_STATES.length, 51);
    for (const s of US_STATES) assert.deepEqual(failingFields({ state: s }), [], s);
    assert.deepEqual(failingFields({ state: 'dc' }), []);
    assert.deepEqual(failingFields({ state: ' il ' }), []);
  });
  it('rejects territories, full names, unknown codes and non-strings', () => {
    for (const v of ['PR', 'GU', 'Illinois', 'XX', '', null]) assert.deepEqual(failingFields({ state: v }), ['state'], String(v));
  });
  it('accepts 5-digit ZIP and ZIP+4', () => {
    assert.deepEqual(failingFields({ zip: '62704' }), []);
    assert.deepEqual(failingFields({ zip: '62704-1234' }), []);
  });
  it('rejects 4 or 6 digits, malformed ZIP+4 and numeric ZIP', () => {
    for (const v of ['6270', '627041', '62704-123', '62704-12345', '62704 1234', 'ABCDE', 62704]) {
      assert.deepEqual(failingFields({ zip: v }), ['zip'], String(v));
    }
  });
});

describe('validateApplication: enumerations', () => {
  it('accepts every housing status and rejects others (case-sensitive)', () => {
    for (const v of HOUSING_STATUSES) assert.deepEqual(failingFields({ housingStatus: v }), [], v);
    for (const v of ['rent', 'LEASE', '', null]) assert.deepEqual(failingFields({ housingStatus: v }), ['housingStatus'], String(v));
  });
  it('accepts every employment status and rejects others', () => {
    for (const v of EMPLOYMENT_STATUSES) assert.deepEqual(failingFields({ employmentStatus: v }), [], v);
    for (const v of ['employed', 'PART_TIME', undefined]) assert.deepEqual(failingFields({ employmentStatus: v }), ['employmentStatus'], String(v));
  });
  it('accepts every card product and rejects unknown or inherited keys', () => {
    for (const v of Object.keys(CARD_PRODUCTS)) assert.deepEqual(failingFields({ cardProduct: v }), [], v);
    for (const v of ['classic', 'GOLD', '__proto__', 'hasOwnProperty', undefined]) {
      assert.deepEqual(failingFields({ cardProduct: v }), ['cardProduct'], String(v));
    }
  });
  it('accepts every shipping method and rejects others', () => {
    for (const v of SHIPPING_METHODS) assert.deepEqual(failingFields({ shippingMethod: v }), [], v);
    for (const v of ['OVERNIGHT', 'standard', 'toString', null]) assert.deepEqual(failingFields({ shippingMethod: v }), ['shippingMethod'], String(v));
  });
  it('lists the allowed values in the error message', () => {
    assert.deepEqual(messagesFor({ cardProduct: 'GOLD' }), ['Card product must be one of CLASSIC, REWARDS, PLATINUM']);
    assert.deepEqual(messagesFor({ shippingMethod: 'X' }), ['Shipping method must be one of STANDARD, EXPEDITED']);
  });
});

describe('validateApplication: money fields', () => {
  for (const field of ['monthlyHousingPayment', 'annualIncome', 'monthlyDebtPayments']) {
    it(`${field}: accepts 0 and decimals`, () => {
      assert.deepEqual(failingFields({ [field]: 0 }), []);
      assert.deepEqual(failingFields({ [field]: 10.5 }), []);
    });
    it(`${field}: rejects negatives, strings, null, NaN, Infinity and missing`, () => {
      for (const v of [-0.01, -1, '100', null, NaN, Infinity, -Infinity, undefined, true]) {
        assert.deepEqual(failingFields({ [field]: v }), [field], `${field}=${String(v)}`);
      }
    });
  }
});

describe('validateApplication: credit score', () => {
  it('accepts the limits 300 and 850', () => {
    assert.deepEqual(failingFields({ creditScore: 300 }), []);
    assert.deepEqual(failingFields({ creditScore: 850 }), []);
  });
  it('rejects 299 and 851 (just outside the range)', () => {
    assert.deepEqual(failingFields({ creditScore: 299 }), ['creditScore']);
    assert.deepEqual(failingFields({ creditScore: 851 }), ['creditScore']);
  });
  it('rejects decimals, strings, null, NaN and Infinity', () => {
    for (const v of [700.5, '700', null, NaN, Infinity, undefined]) {
      assert.deepEqual(messagesFor({ creditScore: v }), ['Credit score must be an integer between 300 and 850'], String(v));
    }
  });
});

describe('validateApplication: booleans', () => {
  it('bankruptcy must be a real boolean', () => {
    assert.deepEqual(failingFields({ bankruptcyLast7Years: true }), []);
    for (const v of ['false', 0, 1, null, undefined]) {
      assert.deepEqual(failingFields({ bankruptcyLast7Years: v }), ['bankruptcyLast7Years'], String(v));
    }
  });
  it('agreeToTerms must be exactly true', () => {
    for (const v of ['true', 1, 'yes', null, undefined]) assert.deepEqual(failingFields({ agreeToTerms: v }), ['agreeToTerms'], String(v));
  });
  it('reports several invalid fields together, in form order', () => {
    assert.deepEqual(failingFields({ firstName: '', zip: '1', creditScore: 1000, agreeToTerms: false }), ['firstName', 'zip', 'creditScore', 'agreeToTerms']);
  });
});

describe('calculateAge', () => {
  const age = (dob, today) => calculateAge(new Date(`${dob}T00:00:00Z`), new Date(today));
  it('turns 18 exactly on the birthday; 17 the day before', () => {
    assert.equal(age('2008-09-29', '2026-09-29T00:00:00Z'), 18);
    assert.equal(age('2008-09-30', '2026-09-29T23:59:59Z'), 17);
    assert.equal(age('2008-09-28', '2026-09-29T00:00:00Z'), 18);
  });
  it('birthday later in the year (month not reached) subtracts a year', () => {
    assert.equal(age('2008-10-01', '2026-09-29T12:00:00Z'), 17);
    assert.equal(age('2008-08-31', '2026-09-29T12:00:00Z'), 18);
  });
  it('Feb 29 birthday: 17 on Feb 28 of a non-leap year, 18 on Mar 1', () => {
    assert.equal(age('2008-02-29', '2026-02-28T12:00:00Z'), 17);
    assert.equal(age('2008-02-29', '2026-03-01T12:00:00Z'), 18);
  });
  it('Feb 29 birthday on a leap year counts on Feb 29 itself', () => {
    assert.equal(age('2010-02-28', '2028-02-28T12:00:00Z'), 18);
    assert.equal(age('2012-02-29', '2030-02-28T12:00:00Z'), 17);
    assert.equal(age('2012-02-29', '2032-02-29T12:00:00Z'), 20);
  });
  it('born today is age 0', () => {
    assert.equal(age('2026-09-29', '2026-09-29T15:00:00Z'), 0);
  });
});

describe('evaluate: age rule', () => {
  it('approves an applicant whose 18th birthday was yesterday', () => {
    assert.equal(evaluate(valid({ dateOfBirth: '2008-09-28' }), TODAY).decision, 'APPROVED');
  });
  it('rejects an applicant who turns 18 tomorrow with the exact age reason', () => {
    const r = evaluate(valid({ dateOfBirth: '2008-09-30' }), TODAY);
    assert.deepEqual(r.reasons, ['Applicant must be at least 18 years old']);
  });
  it('Feb 29 birthday: rejected on 2026-02-28, approved on 2026-03-01', () => {
    const app = valid({ dateOfBirth: '2008-02-29' });
    assert.equal(evaluate(app, new Date('2026-02-28T12:00:00Z')).decision, 'REJECTED');
    assert.equal(evaluate(app, new Date('2026-03-01T12:00:00Z')).decision, 'APPROVED');
  });
});

describe('evaluate: income rule', () => {
  // Low housing/debt keep DTI under 45% so only the income rule is tested.
  const lowIncome = (annualIncome, extra = {}) => valid({ annualIncome, monthlyHousingPayment: 300, monthlyDebtPayments: 100, ...extra });
  it('approves income exactly $12,000', () => {
    const r = evaluate(lowIncome(12000), TODAY);
    assert.equal(r.decision, 'APPROVED');
    assert.equal(r.creditLimit, 1400); // 12% of 12,000
  });
  it('rejects $11,999.99 with the exact income reason', () => {
    const r = evaluate(lowIncome(11999.99), TODAY);
    assert.deepEqual(r.reasons, ['Annual income is below the minimum of $12,000']);
  });
  it('income of 0 is rejected for income and DTI, and dti is reported as null', () => {
    const r = evaluate(valid({ annualIncome: 0, monthlyHousingPayment: 0, monthlyDebtPayments: 0 }), TODAY);
    assert.deepEqual(r.reasons, ['Annual income is below the minimum of $12,000', 'Debt-to-income ratio exceeds 45%']);
    assert.equal(r.dti, null);
  });
});

describe('evaluate: credit score minimum per product', () => {
  for (const [product, min, name] of [['CLASSIC', 580, 'Classic Card'], ['REWARDS', 670, 'Rewards Card'], ['PLATINUM', 740, 'Platinum Card']]) {
    it(`rejects ${name} when credit score is ${min - 1} (min ${min})`, () => {
      const r = evaluate(valid({ cardProduct: product, creditScore: min - 1 }), TODAY);
      assert.deepEqual(r.reasons, [`Credit score is below the minimum of ${min} for the ${name}`]);
    });
    it(`approves ${name} when credit score is ${min} and ${min + 1}`, () => {
      assert.equal(evaluate(valid({ cardProduct: product, creditScore: min }), TODAY).decision, 'APPROVED');
      assert.equal(evaluate(valid({ cardProduct: product, creditScore: min + 1 }), TODAY).decision, 'APPROVED');
    });
  }
});

describe('evaluate: debt-to-income rule', () => {
  // $120,000 / 12 = $10,000 monthly income, so $4,500 total = exactly 45%.
  const dtiApp = (housing, debt) => valid({ annualIncome: 120000, monthlyHousingPayment: housing, monthlyDebtPayments: debt });
  it('approves DTI of exactly 45%', () => {
    const r = evaluate(dtiApp(4000, 500), TODAY);
    assert.equal(r.decision, 'APPROVED');
    assert.equal(r.dti, 0.45);
  });
  it('rejects DTI one cent over 45%', () => {
    const r = evaluate(dtiApp(4000, 500.01), TODAY);
    assert.deepEqual(r.reasons, ['Debt-to-income ratio exceeds 45%']);
  });
  it('counts housing payment and debt payments together', () => {
    assert.equal(evaluate(dtiApp(4501, 0), TODAY).decision, 'REJECTED');
    assert.equal(evaluate(dtiApp(0, 4501), TODAY).decision, 'REJECTED');
    assert.equal(evaluate(dtiApp(0, 0), TODAY).dti, 0);
  });
  it('reports DTI rounded to 4 decimal places', () => {
    assert.equal(evaluate(valid(), TODAY).dti, 0.2471); // 1750 / 7083.33
  });
});

describe('evaluate: bankruptcy and unemployment rules', () => {
  it('rejects bankruptcy with the exact reason', () => {
    assert.deepEqual(evaluate(valid({ bankruptcyLast7Years: true }), TODAY).reasons, ['Bankruptcy reported in the last 7 years']);
  });
  const unemployed = (annualIncome) => valid({ employmentStatus: 'UNEMPLOYED', annualIncome, monthlyHousingPayment: 300, monthlyDebtPayments: 0 });
  it('rejects UNEMPLOYED with income $24,999', () => {
    assert.deepEqual(evaluate(unemployed(24999), TODAY).reasons, ['Insufficient verifiable income while unemployed']);
  });
  it('approves UNEMPLOYED with income exactly $25,000', () => {
    assert.equal(evaluate(unemployed(25000), TODAY).decision, 'APPROVED');
  });
  it('UNEMPLOYED below $12,000 gets both income reasons', () => {
    assert.deepEqual(evaluate(unemployed(11000), TODAY).reasons, [
      'Annual income is below the minimum of $12,000',
      'Insufficient verifiable income while unemployed',
    ]);
  });
  for (const status of ['EMPLOYED', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT']) {
    it(`${status} with $12,000 income is not subject to the $25,000 unemployed rule`, () => {
      const r = evaluate(valid({ employmentStatus: status, annualIncome: 12000, monthlyHousingPayment: 300, monthlyDebtPayments: 0 }), TODAY);
      assert.equal(r.decision, 'APPROVED');
    });
  }
});

describe('evaluate: decision table (all matching reasons returned)', () => {
  it('returns all six reasons, in rule order, when every rule fails', () => {
    const r = evaluate(valid({
      dateOfBirth: '2010-01-01', annualIncome: 6000, creditScore: 500, monthlyHousingPayment: 400, monthlyDebtPayments: 0,
      bankruptcyLast7Years: true, employmentStatus: 'UNEMPLOYED',
    }), TODAY);
    assert.deepEqual(r, {
      decision: 'REJECTED',
      reasons: [
        'Applicant must be at least 18 years old',
        'Annual income is below the minimum of $12,000',
        'Credit score is below the minimum of 580 for the Classic Card',
        'Debt-to-income ratio exceeds 45%',
        'Bankruptcy reported in the last 7 years',
        'Insufficient verifiable income while unemployed',
      ],
      creditLimit: 0,
      apr: null,
      dti: 0.8,
    });
  });
  const cases = [
    ['age + score', { dateOfBirth: '2010-01-01', creditScore: 500 }, 2],
    ['score + DTI', { creditScore: 500, monthlyDebtPayments: 3000 }, 2],
    ['DTI + bankruptcy', { monthlyDebtPayments: 3000, bankruptcyLast7Years: true }, 2],
    ['age + DTI + bankruptcy', { dateOfBirth: '2010-01-01', monthlyDebtPayments: 3000, bankruptcyLast7Years: true }, 3],
  ];
  for (const [label, overrides, count] of cases) {
    it(`rejects with ${count} reasons for ${label}`, () => {
      const r = evaluate(valid(overrides), TODAY);
      assert.equal(r.decision, 'REJECTED');
      assert.equal(r.reasons.length, count);
      assert.equal(r.creditLimit, 0);
      assert.equal(r.apr, null);
    });
  }
  it('approved result has empty reasons and exact limit/APR/dti', () => {
    assert.deepEqual(evaluate(valid(), TODAY), { decision: 'APPROVED', reasons: [], creditLimit: 10000, apr: 24.99, dti: 0.2471 });
  });
  it('uses the current date when "today" is omitted (applicant born 1990 is always an adult)', () => {
    assert.equal(evaluate(valid()).decision, 'APPROVED');
  });
});

describe('creditLimitFor: tiers, caps and floor', () => {
  it('score 580-669: 6% of income, cap $3,000', () => {
    assert.equal(creditLimitFor(580, 40000), 2400);
    assert.equal(creditLimitFor(669, 49999), 2900); // 2999.94 rounded down to $100
    assert.equal(creditLimitFor(669, 50000), 3000);
    assert.equal(creditLimitFor(669, 60000), 3000);
  });
  it('score 670-739: 12% of income, cap $10,000', () => {
    assert.equal(creditLimitFor(670, 50000), 6000);
    assert.equal(creditLimitFor(739, 83333), 9900);
    assert.equal(creditLimitFor(739, 83334), 10000);
    assert.equal(creditLimitFor(739, 200000), 10000);
  });
  it('score 740-799: 20% of income, cap $25,000', () => {
    assert.equal(creditLimitFor(740, 100000), 20000);
    assert.equal(creditLimitFor(799, 125000), 25000);
    assert.equal(creditLimitFor(799, 500000), 25000);
  });
  it('score 800+: 30% of income, cap $50,000', () => {
    assert.equal(creditLimitFor(800, 100000), 30000);
    assert.equal(creditLimitFor(850, 166666), 49900);
    assert.equal(creditLimitFor(850, 166667), 50000);
    assert.equal(creditLimitFor(850, 1000000), 50000);
  });
  it('tier boundaries change the percentage: 669/670, 739/740, 799/800', () => {
    assert.deepEqual([creditLimitFor(669, 40000), creditLimitFor(670, 40000)], [2400, 4800]);
    assert.deepEqual([creditLimitFor(739, 40000), creditLimitFor(740, 40000)], [4800, 8000]);
    assert.deepEqual([creditLimitFor(799, 40000), creditLimitFor(800, 40000)], [8000, 12000]);
  });
  it('$500 floor: 6% of $8,333 = $499.98 -> $500; $10,000 -> $600', () => {
    assert.equal(creditLimitFor(600, 8333), 500);
    assert.equal(creditLimitFor(600, 0), 500);
    assert.equal(creditLimitFor(600, 10000), 600);
  });
});

describe('aprFor: APR by score tier', () => {
  const table = [[300, 29.99], [579, 29.99], [669, 29.99], [670, 24.99], [739, 24.99], [740, 20.99], [799, 20.99], [800, 17.99], [850, 17.99]];
  for (const [score, apr] of table) {
    it(`score ${score} -> ${apr}%`, () => assert.equal(aprFor(score), apr));
  }
});
