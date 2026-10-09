'use strict';

/**
 * Check-digit algorithms and format validators for banking identifiers.
 * Loaded as a classic script in the extension (exposes globalThis.BFSChecksums)
 * and with require() in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BFSChecksums = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const digitsOnly = (s) => String(s).replace(/\D/g, '');
  const compact = (s) => String(s).replace(/[\s-]/g, '').toUpperCase();

  // ---- Luhn (payment cards) -------------------------------------------------

  function luhnCheckDigit(partial) {
    let sum = 0;
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
    const d = digitsOnly(number);
    return d.length > 1 && luhnCheckDigit(d.slice(0, -1)) === d.slice(-1);
  }

  // ---- Verhoeff (Aadhaar) ---------------------------------------------------

  const V_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const V_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const V_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  function verhoeffCheckDigit(partial) {
    let c = 0;
    const rev = partial.split('').reverse();
    for (let i = 0; i < rev.length; i++) c = V_D[c][V_P[(i + 1) % 8][Number(rev[i])]];
    return String(V_INV[c]);
  }

  function isVerhoeffValid(number) {
    const d = digitsOnly(number);
    if (!d.length) return false;
    let c = 0;
    const rev = d.split('').reverse();
    for (let i = 0; i < rev.length; i++) c = V_D[c][V_P[i % 8][Number(rev[i])]];
    return c === 0;
  }

  // ---- ISO 13616 IBAN (mod 97) ----------------------------------------------

  const IBAN_LENGTHS = { GB: 22, DE: 22, IE: 22, NL: 18, FR: 27, ES: 24, IT: 27, BE: 16, CH: 21, AE: 23 };

  function mod97(numeric) {
    let rem = 0;
    for (let i = 0; i < numeric.length; i += 7) rem = Number(String(rem) + numeric.slice(i, i + 7)) % 97;
    return rem;
  }

  const lettersToDigits = (s) => s.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  function ibanCheckDigits(country, bban) {
    const rem = mod97(lettersToDigits(`${bban}${country}00`));
    return String(98 - rem).padStart(2, '0');
  }

  function isIbanValid(iban) {
    const s = compact(iban);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const expected = IBAN_LENGTHS[s.slice(0, 2)];
    if (expected && s.length !== expected) return false;
    return mod97(lettersToDigits(s.slice(4) + s.slice(0, 4))) === 1;
  }

  // ---- ABA routing number (US) ----------------------------------------------

  function abaCheckDigit(first8) {
    const d = first8.split('').map(Number);
    const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5]);
    return String((10 - (sum % 10)) % 10);
  }

  function isAbaValid(routing) {
    const s = String(routing);
    if (!/^\d{9}$/.test(s)) return false;
    const prefix = Number(s.slice(0, 2));
    const validPrefix = (prefix >= 0 && prefix <= 12) || (prefix >= 21 && prefix <= 32) ||
      (prefix >= 61 && prefix <= 72) || prefix === 80;
    return validPrefix && abaCheckDigit(s.slice(0, 8)) === s[8];
  }

  // ---- GSTIN (India) ---------------------------------------------------------

  const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function gstinCheckChar(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const product = GST_CHARS.indexOf(first14[i]) * ((i % 2) + 1);
      sum += Math.floor(product / 36) + (product % 36);
    }
    return GST_CHARS[(36 - (sum % 36)) % 36];
  }

  function isGstinValid(gstin) {
    const s = compact(gstin);
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
    const state = Number(s.slice(0, 2));
    return state >= 1 && state <= 38 && gstinCheckChar(s.slice(0, 14)) === s[14];
  }

  // ---- Format-only validators -------------------------------------------------

  function isSsnValid(ssn) {
    const s = String(ssn);
    if (!/^\d{3}-?\d{2}-?\d{4}$/.test(s)) return false;
    const d = digitsOnly(s);
    return !/^(000|666|9)/.test(d) && d.slice(3, 5) !== '00' && d.slice(5) !== '0000';
  }

  const PAN_ENTITY_TYPES = 'PCHFATBLJG';
  const isPanValid = (pan) => /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(String(pan));
  const isAadhaarValid = (n) => /^[2-9]\d{11}$/.test(digitsOnly(n)) && digitsOnly(n).length === String(n).replace(/\s/g, '').length && isVerhoeffValid(n);
  const isIfscValid = (s) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(s));
  const isBicValid = (s) => /^[A-Z]{4}[A-Z]{2}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/.test(String(s));
  const isTestBic = (s) => isBicValid(s) && String(s)[7] === '0';
  const isSortCodeValid = (s) => /^\d{2}-?\d{2}-?\d{2}$/.test(String(s));
  const isUpiValid = (s) => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(String(s));

  // HMRC rules: first letter not D F I Q U V; second not D F I O Q U V; some prefixes never issued.
  const NI_BAD_PREFIXES = ['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ'];
  function isNiNumberValid(ni) {
    const s = compact(ni);
    return /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/.test(s) && !NI_BAD_PREFIXES.includes(s.slice(0, 2));
  }

  return {
    digitsOnly, compact,
    luhnCheckDigit, isLuhnValid,
    verhoeffCheckDigit, isVerhoeffValid,
    IBAN_LENGTHS, ibanCheckDigits, isIbanValid,
    abaCheckDigit, isAbaValid,
    gstinCheckChar, isGstinValid,
    isSsnValid, PAN_ENTITY_TYPES, isPanValid, isAadhaarValid, isIfscValid,
    isBicValid, isTestBic, isSortCodeValid, isUpiValid, NI_BAD_PREFIXES, isNiNumberValid,
  };
});
