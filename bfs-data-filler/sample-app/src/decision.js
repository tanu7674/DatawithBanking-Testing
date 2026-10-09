'use strict';

/**
 * Mock underwriting engine for the dummy credit card application.
 * All rules are deterministic so testers can design cases for each outcome.
 */

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE',
  'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const CARD_PRODUCTS = {
  CLASSIC: { name: 'Classic Card', minScore: 580, annualFee: 0 },
  REWARDS: { name: 'Rewards Card', minScore: 670, annualFee: 0 },
  PLATINUM: { name: 'Platinum Card', minScore: 740, annualFee: 95 },
};

const EMPLOYMENT_STATUSES = ['EMPLOYED', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'];
const HOUSING_STATUSES = ['RENT', 'OWN', 'MORTGAGE', 'OTHER'];
const SHIPPING_METHODS = ['STANDARD', 'EXPEDITED'];

const MIN_AGE = 18;
const MIN_INCOME = 12000;
const MAX_DTI = 0.45;

function calculateAge(dob, today) {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  // Reject rollovers such as 2023-02-30.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

function isNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Returns a list of { field, message } validation errors (empty when valid). */
function validateApplication(app, today = new Date()) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (!app || typeof app !== 'object') return [{ field: 'body', message: 'Request body must be a JSON object' }];

  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  if (!/^[A-Za-z][A-Za-z '\-]{0,49}$/.test(str(app.firstName))) err('firstName', 'First name is required (letters only, max 50)');
  if (!/^[A-Za-z][A-Za-z '\-]{0,49}$/.test(str(app.lastName))) err('lastName', 'Last name is required (letters only, max 50)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(app.email))) err('email', 'A valid email address is required');
  // Area code is either "(555)" or "555", each with an optional separator; brackets must balance.
  if (!/^(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}$/.test(str(app.phone))) err('phone', 'Phone must be a 10-digit US number');

  const dob = parseDate(app.dateOfBirth);
  if (!dob) err('dateOfBirth', 'Date of birth is required (YYYY-MM-DD)');
  else if (dob > today) err('dateOfBirth', 'Date of birth cannot be in the future');

  const ssn = str(app.ssn);
  if (!/^\d{3}-?\d{2}-?\d{4}$/.test(ssn)) err('ssn', 'SSN must be 9 digits (###-##-####)');
  else {
    const digits = ssn.replace(/-/g, '');
    if (/^(000|666|9)/.test(digits) || digits.slice(3, 5) === '00' || digits.slice(5) === '0000') {
      err('ssn', 'SSN is not a valid issued number');
    }
  }

  if (!str(app.addressLine1)) err('addressLine1', 'Street address is required');
  if (app.addressLine2 != null && typeof app.addressLine2 !== 'string') err('addressLine2', 'Apt, suite or unit must be text');
  if (!str(app.city)) err('city', 'City is required');
  if (!US_STATES.includes(str(app.state).toUpperCase())) err('state', 'A valid US state is required');
  if (!/^\d{5}(-\d{4})?$/.test(str(app.zip))) err('zip', 'ZIP code must be 5 digits (or ZIP+4)');
  if (!HOUSING_STATUSES.includes(app.housingStatus)) err('housingStatus', `Housing status must be one of ${HOUSING_STATUSES.join(', ')}`);
  if (!isNonNegativeNumber(app.monthlyHousingPayment)) err('monthlyHousingPayment', 'Monthly housing payment must be a number >= 0');

  if (!EMPLOYMENT_STATUSES.includes(app.employmentStatus)) err('employmentStatus', `Employment status must be one of ${EMPLOYMENT_STATUSES.join(', ')}`);
  if (!isNonNegativeNumber(app.annualIncome)) err('annualIncome', 'Annual income must be a number >= 0');
  if (!isNonNegativeNumber(app.monthlyDebtPayments)) err('monthlyDebtPayments', 'Monthly debt payments must be a number >= 0');
  if (!Number.isInteger(app.creditScore) || app.creditScore < 300 || app.creditScore > 850) err('creditScore', 'Credit score must be an integer between 300 and 850');
  if (typeof app.bankruptcyLast7Years !== 'boolean') err('bankruptcyLast7Years', 'Bankruptcy answer must be true or false');

  if (!Object.hasOwn(CARD_PRODUCTS, app.cardProduct)) err('cardProduct', `Card product must be one of ${Object.keys(CARD_PRODUCTS).join(', ')}`);
  if (!SHIPPING_METHODS.includes(app.shippingMethod)) err('shippingMethod', `Shipping method must be one of ${SHIPPING_METHODS.join(', ')}`);
  if (app.agreeToTerms !== true) err('agreeToTerms', 'You must agree to the terms and conditions');

  return errors;
}

/**
 * Applies underwriting rules to an already-validated application.
 * Returns { decision: 'APPROVED' | 'REJECTED', reasons: string[], creditLimit, apr }.
 */
function evaluate(app, today = new Date()) {
  const reasons = [];
  const age = calculateAge(parseDate(app.dateOfBirth), today);
  const product = CARD_PRODUCTS[app.cardProduct];
  const monthlyIncome = app.annualIncome / 12;
  const dti = monthlyIncome > 0 ? (app.monthlyDebtPayments + app.monthlyHousingPayment) / monthlyIncome : Infinity;

  if (age < MIN_AGE) reasons.push(`Applicant must be at least ${MIN_AGE} years old`);
  if (app.annualIncome < MIN_INCOME) reasons.push(`Annual income is below the minimum of $${MIN_INCOME.toLocaleString('en-US')}`);
  if (app.creditScore < product.minScore) reasons.push(`Credit score is below the minimum of ${product.minScore} for the ${product.name}`);
  if (dti > MAX_DTI) reasons.push(`Debt-to-income ratio exceeds ${MAX_DTI * 100}%`);
  if (app.bankruptcyLast7Years) reasons.push('Bankruptcy reported in the last 7 years');
  if (app.employmentStatus === 'UNEMPLOYED' && app.annualIncome < 25000) reasons.push('Insufficient verifiable income while unemployed');

  if (reasons.length) return { decision: 'REJECTED', reasons, creditLimit: 0, apr: null, dti: round(dti, 4) };

  return {
    decision: 'APPROVED',
    reasons: [],
    creditLimit: creditLimitFor(app.creditScore, app.annualIncome),
    apr: aprFor(app.creditScore),
    dti: round(dti, 4),
  };
}

function creditLimitFor(score, annualIncome) {
  const pct = score >= 800 ? 0.3 : score >= 740 ? 0.2 : score >= 670 ? 0.12 : 0.06;
  const cap = score >= 800 ? 50000 : score >= 740 ? 25000 : score >= 670 ? 10000 : 3000;
  const limit = Math.min(cap, Math.floor((annualIncome * pct) / 100) * 100);
  return Math.max(500, limit);
}

function aprFor(score) {
  if (score >= 800) return 17.99;
  if (score >= 740) return 20.99;
  if (score >= 670) return 24.99;
  return 29.99;
}

function round(n, places) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

module.exports = {
  US_STATES,
  CARD_PRODUCTS,
  EMPLOYMENT_STATUSES,
  HOUSING_STATUSES,
  SHIPPING_METHODS,
  validateApplication,
  evaluate,
  calculateAge,
  creditLimitFor,
  aprFor,
};
