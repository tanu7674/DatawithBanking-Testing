'use strict';

const crypto = require('node:crypto');

// Dummy BIN (Visa test range). Card numbers are Luhn-valid but not real.
const DUMMY_BIN = '400000';

function luhnCheckDigit(partial) {
  let sum = 0;
  // Walk from the right; the check digit will occupy the position to the right of partial.
  for (let i = partial.length - 1, double = true; i >= 0; i--, double = !double) {
    let d = Number(partial[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

function isLuhnValid(number) {
  const digits = String(number).replace(/\D/g, '');
  return digits.length > 1 && luhnCheckDigit(digits.slice(0, -1)) === digits.slice(-1);
}

function generateCardNumber(randomInt = crypto.randomInt) {
  let body = DUMMY_BIN;
  while (body.length < 15) body += String(randomInt(10));
  return body + luhnCheckDigit(body);
}

function formatCardNumber(number) {
  return number.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function maskCardNumber(number) {
  return `**** **** **** ${number.slice(-4)}`;
}

/** Card expires at the end of the month, 5 years from issue. Returns "MM/YY". */
function expiryDate(issued) {
  const mm = String(issued.getUTCMonth() + 1).padStart(2, '0');
  const yy = String((issued.getUTCFullYear() + 5) % 100).padStart(2, '0');
  return `${mm}/${yy}`;
}

// Observed US federal holidays (USPS does not deliver) for the years the demo is likely to run.
const FEDERAL_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19', '2025-07-04',
  '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24',
  '2027-12-31', // New Year's Day 2028 falls on a Saturday, so it is observed the Friday before.
]);

function isBusinessDay(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !FEDERAL_HOLIDAYS.has(date.toISOString().slice(0, 10));
}

function addBusinessDays(start, days) {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

const SHIPPING_WINDOWS = {
  STANDARD: { label: 'USPS First-Class Mail', minDays: 7, maxDays: 10 },
  EXPEDITED: { label: 'Expedited (UPS 2nd Day)', minDays: 2, maxDays: 3 },
};

/** Estimated delivery window in business days from the approval date. */
function estimateDelivery(approvedOn, shippingMethod) {
  // Object.hasOwn so inherited keys such as "toString" fall back to STANDARD.
  const method = Object.hasOwn(SHIPPING_WINDOWS, shippingMethod) ? shippingMethod : 'STANDARD';
  const w = SHIPPING_WINDOWS[method];
  return {
    method,
    carrier: w.label,
    businessDays: `${w.minDays}-${w.maxDays}`,
    earliest: addBusinessDays(approvedOn, w.minDays).toISOString().slice(0, 10),
    latest: addBusinessDays(approvedOn, w.maxDays).toISOString().slice(0, 10),
  };
}

module.exports = {
  DUMMY_BIN,
  luhnCheckDigit,
  isLuhnValid,
  generateCardNumber,
  formatCardNumber,
  maskCardNumber,
  expiryDate,
  isBusinessDay,
  addBusinessDays,
  estimateDelivery,
  SHIPPING_WINDOWS,
};
