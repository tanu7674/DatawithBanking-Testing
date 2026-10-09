'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');

const TODAY = new Date('2026-09-29T15:00:00Z');

const valid = (overrides = {}) => ({
  cardProduct: 'REWARDS',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-04-15',
  ssn: '123-45-6789',
  email: 'jane@example.com',
  phone: '555-123-4567',
  addressLine1: '742 Evergreen Terrace',
  addressLine2: '',
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
  shippingMethod: 'EXPEDITED',
  agreeToTerms: true,
  ...overrides,
});

let server;
let base;

test.before(async () => {
  server = createServer({ now: () => TODAY });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('approved application returns a card and delivery window, retrievable by id', async () => {
  const res = await post(valid());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.decision, 'APPROVED');
  assert.match(body.card.number, /^4000 00\d{2} \d{4} \d{4}$/);
  assert.equal(body.card.expiry, '09/31');
  assert.equal(body.delivery.method, 'EXPEDITED');
  assert.equal(body.delivery.earliest, '2026-10-01');
  assert.equal(body.delivery.latest, '2026-10-02');
  assert.equal(body.reasons, undefined);

  const again = await fetch(`${base}/api/applications/${body.applicationId}`);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), body);
});

test('rejected application returns reasons and no card', async () => {
  const res = await post(valid({ creditScore: 600 }));
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.decision, 'REJECTED');
  assert.equal(body.card, undefined);
  assert.ok(body.reasons.length >= 1);
});

test('invalid input returns 422 with field details', async () => {
  const res = await post(valid({ zip: 'abc', email: 'nope' }));
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.deepEqual(body.details.map((d) => d.field).sort(), ['email', 'zip']);
});

test('malformed JSON returns 400', async () => {
  const res = await post('{bad');
  assert.equal(res.status, 400);
});

test('unknown application id returns 404; wrong method returns 405', async () => {
  assert.equal((await fetch(`${base}/api/applications/APP-NOPE`)).status, 404);
  assert.equal((await fetch(`${base}/api/applications`)).status, 405);
});

test('static frontend is served', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Apply for a credit card/);
  assert.equal((await fetch(`${base}/result.html`)).status, 200);
});
