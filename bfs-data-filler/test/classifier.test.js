'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, normalize } = require('../lib/classifier.js');

const t = (desc, region = 'US') => classify(Object.assign({ kind: 'text', inputType: 'text' }, desc), region).type;

test('normalize splits identifiers into words', () => {
  assert.equal(normalize('monthlyHousingPayment'), 'monthly housing payment');
  assert.equal(normalize('acct_no'), 'acct no');
  assert.equal(normalize('card-number'), 'card number');
});

test('sample credit card app fields', () => {
  assert.equal(t({ label: 'First name', name: 'firstName', autocomplete: 'given-name' }), 'firstName');
  assert.equal(t({ label: 'Last name', name: 'lastName', autocomplete: 'family-name' }), 'lastName');
  assert.equal(t({ kind: 'date', inputType: 'date', label: 'Date of birth', autocomplete: 'bday' }), 'dob');
  assert.equal(t({ label: 'Social Security Number', name: 'ssn', placeholder: '###-##-####' }), 'ssn');
  assert.equal(t({ inputType: 'email', label: 'Email', name: 'email' }), 'email');
  assert.equal(t({ inputType: 'tel', label: 'Mobile phone', autocomplete: 'tel-national' }), 'phone');
  assert.equal(t({ label: 'Street address', autocomplete: 'address-line1' }), 'addressLine1');
  assert.equal(t({ label: 'Apt, suite, unit (optional)', autocomplete: 'address-line2' }), 'addressLine2');
  assert.equal(t({ kind: 'select', inputType: 'select', label: 'State', autocomplete: 'address-level1' }), 'state');
  assert.equal(t({ label: 'ZIP code', name: 'zip', autocomplete: 'postal-code' }), 'postalCode');
  assert.equal(t({ kind: 'select', inputType: 'select', label: 'Housing', name: 'housingStatus' }), 'choice');
  assert.equal(t({ kind: 'select', inputType: 'select', label: 'Employment status', name: 'employmentStatus' }), 'choice');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Monthly rent / mortgage ($)', name: 'monthlyHousingPayment' }), 'amount');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Total annual income ($)', name: 'annualIncome' }), 'income');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Estimated credit score', name: 'creditScore' }), 'creditScore');
  assert.equal(t({ kind: 'checkbox', inputType: 'checkbox', label: 'I agree to the Cardmember Agreement' }), 'consent');
  assert.equal(t({ kind: 'radio', inputType: 'radio', label: 'Have you filed for bankruptcy?' }), 'choice');
});

test('Indian identifiers', () => {
  assert.equal(t({ label: 'PAN', name: 'pan_no' }, 'IN'), 'pan');
  assert.equal(t({ label: 'Aadhaar number', name: 'aadhaar' }, 'IN'), 'aadhaar');
  assert.equal(t({ label: 'IFSC code', name: 'ifsc' }, 'IN'), 'ifsc');
  assert.equal(t({ label: 'GSTIN (optional)', name: 'gstin' }, 'IN'), 'gstin');
  assert.equal(t({ label: 'UPI ID', name: 'vpa' }, 'IN'), 'upi');
  assert.equal(t({ label: 'PIN code', name: 'pincode' }, 'IN'), 'postalCode');
  assert.equal(t({ label: 'Bank account number', name: 'acct_no' }, 'IN'), 'accountNumber');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Loan amount (₹)', name: 'loanAmt' }, 'IN'), 'amount');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Tenure (months)' }, 'IN'), 'tenure');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Interest rate (%)', name: 'roi' }, 'IN'), 'interestRate');
});

test('UK / EU and card identifiers', () => {
  assert.equal(t({ label: 'National Insurance number', id: 'nino' }, 'UK'), 'niNumber');
  assert.equal(t({ label: 'Sort code', placeholder: '00-00-00' }, 'UK'), 'sortCode');
  assert.equal(t({ label: 'IBAN' }, 'UK'), 'iban');
  assert.equal(t({ label: 'BIC / SWIFT' }, 'UK'), 'bic');
  assert.equal(t({ label: 'Card number', autocomplete: 'cc-number' }), 'cardNumber');
  assert.equal(t({ label: 'Name on card', autocomplete: 'cc-name' }), 'cardHolder');
  assert.equal(t({ label: 'Expiry date', placeholder: 'MM/YY' }), 'cardExpiry');
  assert.equal(t({ label: 'Security code (CVV)' }), 'cardCvv');
  assert.equal(t({ kind: 'select', inputType: 'select', name: 'exp_month', autocomplete: 'cc-exp-month' }), 'cardExpMonth');
  assert.equal(t({ label: 'Routing number' }), 'routingNumber');
});

test('words that rule a type out', () => {
  assert.equal(t({ label: 'Payment reference', id: 'ref' }), 'text');
  assert.equal(t({ kind: 'select', inputType: 'select', label: 'Payment method' }), 'choice');
  assert.equal(t({ kind: 'number', inputType: 'number', label: 'Payment amount' }), 'amount');
});

test('signals from attributes when there is no label', () => {
  assert.equal(t({ name: 'customerEmail' }), 'email');
  assert.equal(t({ inputType: 'email' }), 'email');
  assert.equal(t({ inputType: 'password', name: 'pwd' }), 'password');
  assert.equal(t({ placeholder: 'Enter OTP' }), 'otp');
  assert.equal(t({ name: 'xyz123' }), 'text');
  assert.equal(t({ kind: 'number', inputType: 'number', name: 'qty' }), 'number');
});

test('autocomplete gives high confidence; a weak match gives low', () => {
  assert.equal(classify({ kind: 'text', label: 'x', autocomplete: 'cc-number' }).confidence, 'high');
  assert.equal(classify({ kind: 'text', name: 'nothing' }).confidence, 'low');
});

test('"PAN" prefers the Indian tax ID in India', () => {
  const r = classify({ kind: 'text', label: 'PAN' }, 'IN');
  assert.equal(r.type, 'pan');
  assert.ok(r.score > classify({ kind: 'text', label: 'PAN' }, 'US').score);
});

test('radio groups are choices; checkboxes without consent words are plain checkboxes', () => {
  assert.equal(t({ kind: 'radio', label: 'Card product' }), 'choice');
  assert.equal(t({ kind: 'checkbox', label: 'Send me offers by post' }), 'checkbox');
});
