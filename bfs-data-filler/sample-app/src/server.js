'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateApplication, evaluate, CARD_PRODUCTS, US_STATES } = require('./decision');
const card = require('./card');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allow) {
  return sendJson(res, 405, { error: 'Method not allowed' }, { Allow: allow });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooLarge) return; // Drain the rest so the 413 response can reach the client.
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Payload too large'), { status: 413, closeConnection: true }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(Object.assign(new Error('Malformed JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad request' });
  }
  if (urlPath.includes('\0')) return sendJson(res, 400, { error: 'Bad request' });
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * Creates the HTTP server.
 * options.now: () => Date — injectable clock for tests.
 * options.latencyMs: artificial delay before a decision is returned (simulates a bureau call).
 */
function createServer({ now = () => new Date(), latencyMs = 0 } = {}) {
  const applications = new Map();

  async function handleApply(req, res) {
    const body = await readJsonBody(req);
    const today = now();
    const errors = validateApplication(body, today);
    if (errors.length) return sendJson(res, 422, { error: 'Validation failed', details: errors });

    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));

    const result = evaluate(body, today);
    const applicationId = `APP-${today.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const product = CARD_PRODUCTS[body.cardProduct];

    const response = {
      applicationId,
      decision: result.decision,
      decidedAt: today.toISOString(),
      applicant: { firstName: body.firstName.trim(), lastName: body.lastName.trim(), email: body.email.trim() },
      cardProduct: { code: body.cardProduct, name: product.name, annualFee: product.annualFee },
    };

    if (result.decision === 'APPROVED') {
      const number = card.generateCardNumber();
      response.card = {
        number: card.formatCardNumber(number),
        maskedNumber: card.maskCardNumber(number),
        network: 'VISA',
        expiry: card.expiryDate(today),
        creditLimit: result.creditLimit,
        apr: result.apr,
      };
      response.delivery = {
        ...card.estimateDelivery(today, body.shippingMethod),
        address: {
          addressLine1: body.addressLine1.trim(),
          addressLine2: (body.addressLine2 || '').trim(),
          city: body.city.trim(),
          state: body.state.trim().toUpperCase(),
          zip: body.zip.trim(),
        },
      };
    } else {
      response.reasons = result.reasons;
      response.adverseActionNotice =
        'You will receive a written notice by mail within 30 days explaining this decision, as required by the Equal Credit Opportunity Act.';
    }

    applications.set(applicationId, response);
    return sendJson(res, 201, response);
  }

  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    try {
      if (pathname === '/api/health') {
        if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
        return sendJson(res, 200, { status: 'UP' });
      }
      if (pathname === '/api/reference-data') {
        if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
        return sendJson(res, 200, { states: US_STATES, cardProducts: CARD_PRODUCTS, shipping: card.SHIPPING_WINDOWS });
      }
      if (pathname === '/api/applications') {
        if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
        return await handleApply(req, res);
      }
      const m = pathname.match(/^\/api\/applications\/([A-Za-z0-9-]+)$/);
      if (m) {
        if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
        const found = applications.get(m[1]);
        return found ? sendJson(res, 200, found) : sendJson(res, 404, { error: 'Application not found' });
      }
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      return serveStatic(req, res);
    } catch (e) {
      if (!res.headersSent) {
        sendJson(res, e.status || 500, { error: e.status ? e.message : 'Internal server error' }, e.closeConnection ? { Connection: 'close' } : {});
      }
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const latencyMs = process.env.MOCK_LATENCY_MS !== undefined ? Number(process.env.MOCK_LATENCY_MS) : 1200;
  createServer({ latencyMs }).listen(port, () => {
    console.log(`Credit card demo running at http://localhost:${port}`);
  });
}

module.exports = { createServer };
