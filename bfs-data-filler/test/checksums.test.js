'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/checksums.js');

test('Luhn: known card numbers', () => {
  assert.equal(C.isLuhnValid('4111 1111 1111 1111'), true);
  assert.equal(C.isLuhnValid('378282246310005'), true); // Amex test number
  assert.equal(C.isLuhnValid('4111111111111112'), false);
  assert.equal(C.luhnCheckDigit('411111111111111'), '1');
});

test('Verhoeff: textbook vector 236 -> 3', () => {
  assert.equal(C.verhoeffCheckDigit('236'), '3');
  assert.equal(C.isVerhoeffValid('2363'), true);
  assert.equal(C.isVerhoeffValid('2364'), false);
});

test('IBAN: published examples validate, a single changed digit does not', () => {
  assert.equal(C.isIbanValid('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(C.isIbanValid('DE89370400440532013000'), true);
  assert.equal(C.isIbanValid('NL91ABNA0417164300'), true);
  assert.equal(C.isIbanValid('GB82WEST12345698765433'), false);
  assert.equal(C.isIbanValid('GB82WEST1234569876543'), false, 'wrong length for GB');
  assert.equal(C.ibanCheckDigits('GB', 'WEST12345698765432'), '82');
});

test('ABA routing: published routing numbers', () => {
  assert.equal(C.isAbaValid('011000015'), true);
  assert.equal(C.isAbaValid('021000021'), true);
  assert.equal(C.isAbaValid('021000022'), false);
  assert.equal(C.isAbaValid('13100001X'), false);
});

test('GSTIN: published example and check character', () => {
  assert.equal(C.isGstinValid('27AAPFU0939F1ZV'), true);
  assert.equal(C.gstinCheckChar('27AAPFU0939F1Z'), 'V');
  assert.equal(C.isGstinValid('27AAPFU0939F1ZW'), false);
});

test('SSN rules', () => {
  assert.equal(C.isSsnValid('123-45-6789'), true);
  for (const bad of ['000-12-3456', '666-12-3456', '912-34-5678', '123-00-4567', '123-45-0000', '123-45-678']) {
    assert.equal(C.isSsnValid(bad), false, bad);
  }
});

test('format validators', () => {
  assert.equal(C.isPanValid('ABCPE1234F'), true);
  assert.equal(C.isPanValid('ABCXE1234F'), false);
  assert.equal(C.isIfscValid('SBIN0001234'), true);
  assert.equal(C.isIfscValid('SBIN1001234'), false);
  assert.equal(C.isBicValid('NWBKGB2L'), true);
  assert.equal(C.isBicValid('NWBKGB2LXXX'), true);
  assert.equal(C.isTestBic('NWBKGB20'), true);
  assert.equal(C.isBicValid('NWBKGB1L'), false);
  assert.equal(C.isNiNumberValid('AB123456C'), true);
  assert.equal(C.isNiNumberValid('QQ123456C'), false);
  assert.equal(C.isNiNumberValid('GB123456A'), false);
  assert.equal(C.isUpiValid('priya.sharma@okaxis'), true);
  assert.equal(C.isUpiValid('priya sharma@okaxis'), false);
});
