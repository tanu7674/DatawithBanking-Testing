'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../src/server');
const { CARD_PRODUCTS, US_STATES } = require('../src/decision');
const { SHIPPING_WINDOWS, isLuhnValid } = require('../src/card');

const TODAY = new Date('2026-09-29T15:00:00Z'); // a Tuesday

const valid = (overrides = {}) => ({
  cardProduct: 'REWARDS',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-04-15',
  ssn: '123-45-6789',
  email: 'jane@example.com',
  phone: '555-123-4567',
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

async function start(options = {}) {
  const server = createServer({ now: () => TODAY, latencyMs: 0, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}` };
}

/** Raw HTTP request that does not normalise the path (fetch would resolve "..", etc.). */
function raw(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const headers = body !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {};
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

let ctx;
before(async () => {
  ctx = await start();
});
after(() => ctx.server.close());

const post = (body, base = ctx.base) =>
  fetch(`${base}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('GET /api/health', () => {
  it('returns 200 {status: "UP"} as non-cached JSON', async () => {
    const res = await fetch(`${ctx.base}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { status: 'UP' });
  });
  it(
    'POST /api/health returns 405 Method not allowed',
    async () => {
      assert.equal((await fetch(`${ctx.base}/api/health`, { method: 'POST' })).status, 405);
    },
  );
});

describe('GET /api/reference-data', () => {
  it('returns the 51 states, card products and shipping windows', async () => {
    const res = await fetch(`${ctx.base}/api/reference-data`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.states, US_STATES);
    assert.equal(body.states.length, 51);
    assert.deepEqual(body.cardProducts, CARD_PRODUCTS);
    assert.deepEqual(body.shipping, SHIPPING_WINDOWS);
  });
});

describe('POST /api/applications: approved', () => {
  it('returns 201 with the full approved response (Rewards, STANDARD shipping)', async () => {
    const res = await post(valid());
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await res.json();
    assert.match(body.applicationId, /^APP-20260929-[0-9A-F]{6}$/);
    assert.equal(body.decision, 'APPROVED');
    assert.equal(body.decidedAt, '2026-09-29T15:00:00.000Z');
    assert.deepEqual(body.applicant, { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });
    assert.deepEqual(body.cardProduct, { code: 'REWARDS', name: 'Rewards Card', annualFee: 0 });

    const digits = body.card.number.replace(/ /g, '');
    assert.match(body.card.number, /^4000 00\d{2} \d{4} \d{4}$/);
    assert.ok(isLuhnValid(digits));
    assert.equal(body.card.maskedNumber, `**** **** **** ${digits.slice(-4)}`);
    assert.equal(body.card.network, 'VISA');
    assert.equal(body.card.expiry, '09/31');
    assert.equal(body.card.creditLimit, 10000);
    assert.equal(body.card.apr, 24.99);

    assert.deepEqual(body.delivery, {
      method: 'STANDARD',
      carrier: 'USPS First-Class Mail',
      businessDays: '7-10',
      earliest: '2026-10-08',
      latest: '2026-10-14',
      address: { addressLine1: '742 Evergreen Terrace', addressLine2: '', city: 'Springfield', state: 'IL', zip: '62704' },
    });
    assert.equal(body.reasons, undefined);
    assert.equal(body.adverseActionNotice, undefined);
  });

  it('Platinum with score 800 gets $95 fee, 30% limit and 17.99% APR', async () => {
    const body = await (await post(valid({ cardProduct: 'PLATINUM', creditScore: 800 }))).json();
    assert.equal(body.decision, 'APPROVED');
    assert.deepEqual(body.cardProduct, { code: 'PLATINUM', name: 'Platinum Card', annualFee: 95 });
    assert.equal(body.card.creditLimit, 25500); // 30% of 85,000
    assert.equal(body.card.apr, 17.99);
  });

  it('trims names, email, address fields and upper-cases the state in the response', async () => {
    const body = await (await post(valid({
      firstName: '  Jane ', lastName: ' Doe  ', email: ' jane@example.com ', addressLine1: ' 742 Evergreen Terrace ',
      addressLine2: ' Apt 2B ', city: ' Springfield ', state: 'il', zip: ' 62704-1234 ',
    }))).json();
    assert.deepEqual(body.applicant, { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });
    assert.deepEqual(body.delivery.address, { addressLine1: '742 Evergreen Terrace', addressLine2: 'Apt 2B', city: 'Springfield', state: 'IL', zip: '62704-1234' });
  });

  it(
    'trims the state code in the delivery address ("  il " -> "IL")',
    async () => {
      const body = await (await post(valid({ state: ' il ' }))).json();
      assert.equal(body.delivery.address.state, 'IL');
    },
  );

  it('each application gets a unique id and can be fetched back unchanged', async () => {
    const a = await (await post(valid())).json();
    const b = await (await post(valid())).json();
    assert.notEqual(a.applicationId, b.applicationId);
    const res = await fetch(`${ctx.base}/api/applications/${a.applicationId}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), a);
  });

  it('ignores a query string when fetching an application by id', async () => {
    const a = await (await post(valid())).json();
    assert.equal((await fetch(`${ctx.base}/api/applications/${a.applicationId}?view=1`)).status, 200);
  });
});

describe('POST /api/applications: rejected', () => {
  it('returns 201 with exact reasons and the adverse action notice, no card or delivery', async () => {
    const res = await post(valid({ creditScore: 669 }));
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.decision, 'REJECTED');
    assert.deepEqual(body.reasons, ['Credit score is below the minimum of 670 for the Rewards Card']);
    assert.equal(
      body.adverseActionNotice,
      'You will receive a written notice by mail within 30 days explaining this decision, as required by the Equal Credit Opportunity Act.',
    );
    assert.equal(body.card, undefined);
    assert.equal(body.delivery, undefined);
    assert.deepEqual(body.cardProduct, { code: 'REWARDS', name: 'Rewards Card', annualFee: 0 });
  });

  it('returns every matching reason (score 500 + bankruptcy)', async () => {
    const body = await (await post(valid({ creditScore: 500, bankruptcyLast7Years: true }))).json();
    assert.deepEqual(body.reasons, ['Credit score is below the minimum of 670 for the Rewards Card', 'Bankruptcy reported in the last 7 years']);
  });

  it('rejected applications are stored and retrievable by id', async () => {
    const body = await (await post(valid({ dateOfBirth: '2008-09-30' }))).json();
    assert.deepEqual(body.reasons, ['Applicant must be at least 18 years old']);
    const again = await fetch(`${ctx.base}/api/applications/${body.applicationId}`);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), body);
  });
});

describe('POST /api/applications: validation and body errors', () => {
  it('returns 422 "Validation failed" with exact field details', async () => {
    const res = await post(valid({ zip: '1234', ssn: '000-12-3456', agreeToTerms: false }));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
    assert.deepEqual(body.details, [
      { field: 'ssn', message: 'SSN is not a valid issued number' },
      { field: 'zip', message: 'ZIP code must be 5 digits (or ZIP+4)' },
      { field: 'agreeToTerms', message: 'You must agree to the terms and conditions' },
    ]);
  });

  it('rejects a date of birth after the server date (injected clock) with 422', async () => {
    const body = await (await post(valid({ dateOfBirth: '2026-09-30' }))).json();
    assert.deepEqual(body.details, [{ field: 'dateOfBirth', message: 'Date of birth cannot be in the future' }]);
  });

  for (const [label, payload] of [['an empty body', ''], ['JSON null', 'null'], ['a JSON number', '42'], ['a JSON string', '"hello"']]) {
    it(`returns 422 with a single "body" error for ${label}`, async () => {
      const res = await post(payload);
      assert.equal(res.status, 422);
      assert.deepEqual((await res.json()).details, [{ field: 'body', message: 'Request body must be a JSON object' }]);
    });
  }

  it('returns 422 listing all required fields for an empty object', async () => {
    const res = await post({});
    assert.equal(res.status, 422);
    assert.equal((await res.json()).details.length, 20);
  });

  it('returns 400 "Malformed JSON body" for invalid JSON', async () => {
    for (const bad of ['{bad', '{"a":1,}', "{'a':1}"]) {
      const res = await post(bad);
      assert.equal(res.status, 400, bad);
      assert.deepEqual(await res.json(), { error: 'Malformed JSON body' });
    }
  });

  it('accepts a body of exactly 64 KiB (65,536 bytes)', async () => {
    const base = JSON.stringify(valid({ addressLine2: '' }));
    const padded = JSON.stringify(valid({ addressLine2: 'x'.repeat(65536 - Buffer.byteLength(base)) }));
    assert.equal(Buffer.byteLength(padded), 65536);
    const res = await raw(ctx.port, 'POST', '/api/applications', padded);
    assert.equal(res.status, 201);
  });

  it('refuses a body over 64 KiB (65,537 bytes) without creating an application', async () => {
    const base = JSON.stringify(valid({ addressLine2: '' }));
    const oversized = JSON.stringify(valid({ addressLine2: 'x'.repeat(65537 - Buffer.byteLength(base)) }));
    assert.equal(Buffer.byteLength(oversized), 65537);
    const outcome = await raw(ctx.port, 'POST', '/api/applications', oversized).then((r) => r.status, (e) => e.code);
    assert.notEqual(outcome, 201);
    // Server keeps working afterwards.
    assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
  });

  it(
    'returns 413 "Payload too large" for a body over 64 KiB',
    async () => {
      const res = await raw(ctx.port, 'POST', '/api/applications', JSON.stringify(valid({ addressLine2: 'x'.repeat(70000) })));
      assert.equal(res.status, 413);
      assert.deepEqual(JSON.parse(res.body), { error: 'Payload too large' });
    },
  );

  it('an unexpected server error returns a generic 500 message without internal details', async () => {
    // Force the approval path to throw by temporarily stubbing the card number generator.
    const cardModule = require('../src/card');
    const original = cardModule.generateCardNumber;
    cardModule.generateCardNumber = () => {
      throw new Error('secret internal detail');
    };
    try {
      const res = await post(valid());
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: 'Internal server error' });
    } finally {
      cardModule.generateCardNumber = original;
    }
  });

  it(
    'a non-string addressLine2 is reported as a 422 validation error',
    async () => {
      const res = await post(valid({ addressLine2: 5 }));
      assert.equal(res.status, 422);
      assert.deepEqual((await res.json()).details.map((d) => d.field), ['addressLine2']);
    },
  );
});

describe('routing: methods and unknown resources', () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    it(`${method} /api/applications returns 405`, async () => {
      const res = await fetch(`${ctx.base}/api/applications`, { method });
      assert.equal(res.status, 405);
      assert.deepEqual(await res.json(), { error: 'Method not allowed' });
    });
  }
  it('unknown application id returns 404 "Application not found"', async () => {
    const res = await fetch(`${ctx.base}/api/applications/APP-20260929-FFFFFF`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Application not found' });
  });
  it('id with characters outside [A-Za-z0-9-] returns generic 404', async () => {
    const res = await fetch(`${ctx.base}/api/applications/APP_1`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  });
  it('unknown API route returns 404 JSON', async () => {
    const res = await fetch(`${ctx.base}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  });
  it('non-GET request to a static path returns 405', async () => {
    assert.equal((await fetch(`${ctx.base}/`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${ctx.base}/index.html`, { method: 'DELETE' })).status, 405);
  });
  it('applications are stored per server instance (another server returns 404)', async () => {
    const other = await start();
    try {
      const a = await (await post(valid())).json();
      assert.equal((await fetch(`${other.base}/api/applications/${a.applicationId}`)).status, 404);
    } finally {
      other.server.close();
    }
  });
});

describe('static files', () => {
  const cases = [
    ['/', 'text/html; charset=utf-8'],
    ['/index.html', 'text/html; charset=utf-8'],
    ['/result.html', 'text/html; charset=utf-8'],
    ['/styles.css', 'text/css; charset=utf-8'],
    ['/app.js', 'text/javascript; charset=utf-8'],
    ['/result.js', 'text/javascript; charset=utf-8'],
    ['/favicon.svg', 'image/svg+xml'],
  ];
  for (const [p, type] of cases) {
    it(`serves ${p} with Content-Type ${type}`, async () => {
      const res = await fetch(`${ctx.base}${p}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), type);
    });
  }
  it('missing file returns 404 JSON', async () => {
    const res = await fetch(`${ctx.base}/missing.html`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  });
  it('path traversal with encoded slashes (/..%2fsrc%2fserver.js) returns 403', async () => {
    const res = await raw(ctx.port, 'GET', '/..%2fsrc%2fserver.js');
    assert.equal(res.status, 403);
    assert.deepEqual(JSON.parse(res.body), { error: 'Forbidden' });
  });
  it('path traversal to package.json via encoded slashes returns 403', async () => {
    const res = await raw(ctx.port, 'GET', '/..%2f..%2fpackage.json');
    assert.equal(res.status, 403);
  });
  it('plain "../" segments are resolved inside public/ and do not leak files (404)', async () => {
    const res = await raw(ctx.port, 'GET', '/../package.json');
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.body, /credit-card-booking-demo/);
  });
  it('malformed percent-encoding does not crash the server or leak details', async () => {
    const res = await raw(ctx.port, 'GET', '/%E0%A4%A');
    assert.ok(res.status >= 400);
    assert.doesNotMatch(res.body, /URIError|at /);
    assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
  });
  it(
    'malformed percent-encoding returns 400 Bad Request',
    async () => {
      assert.equal((await raw(ctx.port, 'GET', '/%E0%A4%A')).status, 400);
    },
  );
  it(
    'an encoded null byte in the path returns 400 or 404',
    async () => {
      assert.ok([400, 404].includes((await raw(ctx.port, 'GET', '/%00')).status));
    },
  );
});

describe('createServer options', () => {
  it('latencyMs delays the decision by at least that long', async () => {
    const slow = await start({ latencyMs: 60 });
    try {
      const t0 = Date.now();
      const res = await post(valid(), slow.base);
      assert.equal(res.status, 201);
      assert.ok(Date.now() - t0 >= 50, 'response came back too fast');
    } finally {
      slow.server.close();
    }
  });
  it('the injected clock drives the id date, decidedAt, expiry and delivery dates', async () => {
    const dec = await start({ now: () => new Date('2026-12-31T10:00:00Z') });
    try {
      const body = await (await post(valid({ shippingMethod: 'EXPEDITED' }), dec.base)).json();
      assert.match(body.applicationId, /^APP-20261231-[0-9A-F]{6}$/);
      assert.equal(body.decidedAt, '2026-12-31T10:00:00.000Z');
      assert.equal(body.card.expiry, '12/31');
      assert.equal(body.delivery.earliest, '2027-01-05'); // skips New Year (Fri) + weekend
      assert.equal(body.delivery.latest, '2027-01-06');
    } finally {
      dec.server.close();
    }
  });
  it('works with no options at all (default clock and latency)', async () => {
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
      assert.equal(res.status, 200);
    } finally {
      server.close();
    }
  });
});

describe('running src/server.js directly', () => {
  async function freePort() {
    const s = http.createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const { port } = s.address();
    await new Promise((r) => s.close(r));
    return port;
  }
  function launch(env) {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const ready = new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (c) => {
        out += c;
        if (out.includes('Credit card demo running at')) resolve(out);
      });
      child.on('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
      setTimeout(() => reject(new Error('server did not start in 5s')), 5000).unref();
    });
    return { child, ready };
  }

  for (const [label, extraEnv] of [['MOCK_LATENCY_MS=0', { MOCK_LATENCY_MS: '0' }], ['default latency', {}]]) {
    it(`starts on the PORT env var and answers /api/health (${label})`, async () => {
      const port = await freePort();
      const env = { ...process.env, PORT: String(port), ...extraEnv };
      if (!('MOCK_LATENCY_MS' in extraEnv)) delete env.MOCK_LATENCY_MS;
      const { child, ready } = launch(env);
      try {
        const out = await ready;
        assert.match(out, new RegExp(`http://localhost:${port}`));
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.deepEqual(await res.json(), { status: 'UP' });
      } finally {
        child.kill();
      }
    });
  }
});
