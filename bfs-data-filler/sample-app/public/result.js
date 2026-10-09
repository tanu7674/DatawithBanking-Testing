'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const longDate = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  function show(id) {
    $('loading').hidden = true;
    $(id).hidden = false;
  }

  function renderApproved(app) {
    const { applicant, card, delivery, cardProduct } = app;
    $('a-name').textContent = applicant.firstName;
    $('a-product').textContent = cardProduct.name;
    $('cc-product-short').textContent = cardProduct.name.replace(' Card', '').toUpperCase();
    $('cc-number').textContent = card.number;
    $('cc-holder').textContent = `${applicant.firstName} ${applicant.lastName}`.toUpperCase();
    $('cc-expiry').textContent = card.expiry;
    $('a-id').textContent = app.applicationId;
    $('a-limit').textContent = usd(card.creditLimit);
    $('a-apr').textContent = `${card.apr.toFixed(2)}% variable`;
    $('a-fee').textContent = cardProduct.annualFee ? usd(cardProduct.annualFee) : '$0';
    $('d-earliest').textContent = longDate(delivery.earliest);
    $('d-latest').textContent = longDate(delivery.latest);
    $('d-carrier').textContent = delivery.carrier;
    $('d-days').textContent = delivery.businessDays;
    const a = delivery.address;
    $('d-address').textContent = [a.addressLine1, a.addressLine2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join('\n');
    show('approved');
  }

  function renderRejected(app) {
    $('r-name').textContent = app.applicant.firstName;
    $('r-product').textContent = app.cardProduct.name;
    for (const reason of app.reasons) {
      const li = document.createElement('li');
      li.textContent = reason;
      $('r-reasons').append(li);
    }
    $('r-notice').textContent = app.adverseActionNotice;
    $('r-id').textContent = app.applicationId;
    show('rejected');
  }

  const id = new URLSearchParams(location.search).get('id');
  if (!id) return show('not-found');

  fetch(`/api/applications/${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((app) => (app.decision === 'APPROVED' ? renderApproved(app) : renderRejected(app)))
    .catch(() => show('not-found'));
})();
