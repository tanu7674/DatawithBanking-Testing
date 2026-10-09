'use strict';

/**
 * Works out which BFS data type a form field expects, from a plain descriptor of the field
 * (label, name, id, autocomplete, placeholder...). Pure function, so it runs in Node tests too.
 *
 * Descriptor: { kind, inputType, name, id, autocomplete, placeholder, ariaLabel, label, testId, maxLength, min, max }
 *   kind: 'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox'
 * Result:     { type, confidence: 'high' | 'medium' | 'low', score, reason }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BFSClassifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Split camelCase / snake_case / kebab-case into lower-case words. */
  function normalize(s) {
    return String(s || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Order matters only for ties: specific identifiers come before generic ones.
  // ac: HTML autocomplete tokens; re: regex over normalised text; not: text that rules the type out;
  // w: weight; kinds: field kinds the type applies to.
  const TEXTUAL = ['text', 'number'];
  const RULES = [
    { type: 'ssn', re: /\bssn\b|social security|\bsocial sec\b/, w: 9, kinds: TEXTUAL },
    { type: 'pan', re: /\bpan (card|no|number)\b|permanent account|\bpan\b/, w: 9, kinds: TEXTUAL, region: 'IN' },
    { type: 'aadhaar', re: /aadhaa?r|\buidai\b|\buid\b/, w: 9, kinds: TEXTUAL },
    { type: 'gstin', re: /\bgst(in)?\b/, w: 9, kinds: TEXTUAL },
    { type: 'ifsc', re: /\bifsc\b/, w: 9, kinds: TEXTUAL },
    { type: 'upi', re: /\bupi\b|\bvpa\b/, w: 9, kinds: TEXTUAL },
    { type: 'iban', re: /\biban\b/, w: 9, kinds: TEXTUAL },
    { type: 'bic', re: /\bbic\b|\bswift\b/, w: 9, kinds: TEXTUAL },
    { type: 'sortCode', re: /\bsort ?code\b/, w: 9, kinds: TEXTUAL },
    { type: 'niNumber', re: /national insurance|\bnino\b|\bni (number|no)\b/, w: 9, kinds: TEXTUAL },
    { type: 'routingNumber', re: /routing|\baba\b|\brtn\b|transit number/, w: 9, kinds: TEXTUAL },
    { type: 'cardCvv', ac: ['cc-csc'], re: /\bcvv2?\b|\bcvc2?\b|\bcvn\b|security code|card code|\bcsc\b/, w: 9, kinds: TEXTUAL },
    { type: 'cardExpMonth', ac: ['cc-exp-month'], re: /\bexp\w* month\b|\bexpiry mm\b|\bexp mm\b/, w: 9, kinds: ['text', 'number', 'select'] },
    { type: 'cardExpYear', ac: ['cc-exp-year'], re: /\bexp\w* year\b|\bexpiry yy(yy)?\b|\bexp yy(yy)?\b/, w: 9, kinds: ['text', 'number', 'select'] },
    { type: 'cardExpiry', ac: ['cc-exp'], re: /expir|\bexp\b|valid (thru|through|till)|mm ?\/ ?yy/, w: 7, kinds: ['text', 'date'] },
    { type: 'cardHolder', ac: ['cc-name'], re: /card ?holder|name on (the )?card/, w: 9, kinds: TEXTUAL },
    { type: 'cardNumber', ac: ['cc-number'], re: /card ?(number|no|num)\b|credit card|debit card|\bcc ?(number|num|no)\b|\bccn\b/, w: 8, kinds: TEXTUAL },
    { type: 'otp', ac: ['one-time-code'], re: /\botp\b|one ?time|verification code|\bauth\w* code\b/, w: 8, kinds: TEXTUAL },
    { type: 'creditScore', re: /credit score|\bcibil\b|\bfico\b|bureau score/, w: 9, kinds: TEXTUAL },
    { type: 'income', re: /income|salary|earnings/, w: 7, kinds: TEXTUAL },
    { type: 'interestRate', re: /interest|\bapr\b|\broi\b|\brate\b/, w: 6, kinds: TEXTUAL },
    { type: 'tenure', re: /tenure|loan term|\bterm (in )?months\b|\bduration\b/, w: 7, kinds: TEXTUAL },
    { type: 'accountNumber', re: /\b(bank )?(account|acct|a ?c) ?(number|no|num)\b|\bacct\b|\bbank account\b/, w: 7, kinds: TEXTUAL },
    { type: 'dob', ac: ['bday'], re: /birth|\bdob\b|birthday/, w: 8, kinds: ['text', 'date'] },
    { type: 'email', ac: ['email'], re: /e ?mail/, w: 8, kinds: ['text'] },
    { type: 'phone', ac: ['tel', 'tel-national', 'tel-local'], re: /phone|mobile|\bcell\b|\btel\b|contact (number|no)/, w: 7, kinds: TEXTUAL },
    { type: 'firstName', ac: ['given-name'], re: /first ?name|given ?name|forename|\bfname\b/, w: 8, kinds: ['text'] },
    { type: 'lastName', ac: ['family-name'], re: /last ?name|surname|family ?name|\blname\b/, w: 8, kinds: ['text'] },
    { type: 'fullName', ac: ['name'], re: /full ?name|\bname\b/, w: 4, kinds: ['text'] },
    { type: 'password', ac: ['new-password', 'current-password'], re: /password|passcode|\bmpin\b/, w: 8, kinds: ['text'] },
    { type: 'addressLine2', ac: ['address-line2'], re: /address (line )?2|\bapt\b|apartment|suite|\bunit\b|\bflat\b|building/, w: 7, kinds: ['text'] },
    { type: 'addressLine1', ac: ['address-line1', 'street-address'], re: /address (line )?1|street|\baddress\b/, w: 5, kinds: ['text'] },
    { type: 'city', ac: ['address-level2'], re: /\bcity\b|\btown\b|locality/, w: 7, kinds: ['text', 'select'] },
    { type: 'state', ac: ['address-level1'], re: /\bstate\b|province|\bcounty\b|\bregion\b/, w: 7, kinds: ['text', 'select'] },
    { type: 'postalCode', ac: ['postal-code'], re: /\bzip|postal|post ?code|\bpin ?code\b|\bpincode\b/, w: 8, kinds: TEXTUAL },
    { type: 'country', ac: ['country', 'country-name'], re: /country|nationality/, w: 7, kinds: ['text', 'select'] },
    { type: 'amount', ac: ['transaction-amount'], re: /amount|\$|₹|£|€|payment|\brent\b|mortgage|\bdebt\b|deposit|withdraw|balance|\blimit\b|price|\bfee\b|\bloan\b/, not: /reference|\bref\b|method|mode|frequency|purpose|\btype\b/, w: 5, kinds: TEXTUAL },
    { type: 'consent', re: /agree|terms|consent|accept|authori[sz]e|declar|confirm/, w: 7, kinds: ['checkbox'] },
  ];

  const FALLBACK = { text: 'text', number: 'number', date: 'date', select: 'choice', radio: 'choice', checkbox: 'checkbox' };

  function classify(desc, region) {
    const kind = desc.kind || 'text';
    if (kind === 'radio') return { type: 'choice', confidence: 'high', score: 10, reason: 'radio group' };

    const ac = String(desc.autocomplete || '').toLowerCase().split(/\s+/).filter(Boolean);
    const sources = [
      ['label', normalize([desc.label, desc.ariaLabel].filter(Boolean).join(' ')), 0],
      ['name/id', normalize([desc.name, desc.id, desc.testId].filter(Boolean).join(' ')), -1],
      ['placeholder', normalize(desc.placeholder), -2],
    ];

    let best = null;
    for (const rule of RULES) {
      if (!rule.kinds.includes(kind)) continue;
      let score = 0;
      let reason = '';
      if (rule.ac && rule.ac.some((t) => ac.includes(t))) {
        score = 10 + rule.w;
        reason = `autocomplete="${desc.autocomplete}"`;
      } else {
        for (const [where, text, adjust] of sources) {
          const m = text && !(rule.not && rule.not.test(text)) && text.match(rule.re);
          if (m && rule.w + adjust > score) {
            score = rule.w + adjust;
            reason = `${where} matches "${m[0].trim()}"`;
          }
        }
      }
      if (!score) continue;
      if (rule.region) score += rule.region === region ? 1 : -2;
      if (desc.inputType === 'email' && rule.type === 'email') score += 4;
      if (desc.inputType === 'tel' && rule.type === 'phone') score += 3;
      if (desc.inputType === 'password' && rule.type === 'password') score += 4;
      if (!best || score > best.score) best = { type: rule.type, score, reason };
    }

    // Input types are strong signals even without a matching label.
    if (!best || best.score < 5) {
      if (desc.inputType === 'email') best = { type: 'email', score: 8, reason: 'type="email"' };
      else if (desc.inputType === 'tel') best = { type: 'phone', score: 6, reason: 'type="tel"' };
      else if (desc.inputType === 'password') best = { type: 'password', score: 8, reason: 'type="password"' };
    }

    if (!best || best.score < 4) {
      return { type: FALLBACK[kind] || 'text', confidence: 'low', score: 0, reason: `no specific match – generic ${kind}` };
    }
    const confidence = best.score >= 10 ? 'high' : best.score >= 7 ? 'medium' : 'low';
    return Object.assign(best, { confidence });
  }

  return { classify, normalize, RULES };
});
