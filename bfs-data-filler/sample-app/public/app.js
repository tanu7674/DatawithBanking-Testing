'use strict';

(function () {
  const form = document.getElementById('application-form');
  const formError = document.getElementById('form-error');
  const processing = document.getElementById('processing');
  const submitBtn = document.getElementById('submit-btn');
  const stateSelect = document.getElementById('state');

  fetch('/api/reference-data')
    .then((r) => r.json())
    .then(({ states }) => {
      for (const s of states) stateSelect.add(new Option(s, s));
    })
    .catch(() => showFormError('Could not load reference data. Is the server running?'));

  // Auto-format SSN as ###-##-####.
  document.getElementById('ssn').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 9);
    e.target.value = d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
  });

  document.getElementById('fill-sample').addEventListener('click', () => {
    const sample = {
      firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-04-15', ssn: '123-45-6789',
      email: 'jane.doe@example.com', phone: '(555) 123-4567', addressLine1: '742 Evergreen Terrace',
      addressLine2: 'Apt 2B', city: 'Springfield', state: 'IL', zip: '62704', housingStatus: 'RENT',
      monthlyHousingPayment: 1400, employmentStatus: 'EMPLOYED', annualIncome: 85000,
      monthlyDebtPayments: 350, creditScore: 725,
    };
    for (const [k, v] of Object.entries(sample)) form.elements[k].value = v;
    form.elements.agreeToTerms.checked = true;
    clearErrors();
  });

  function buildPayload() {
    const f = form.elements;
    const num = (name) => (f[name].value.trim() === '' ? null : Number(f[name].value));
    return {
      cardProduct: f.cardProduct.value,
      firstName: f.firstName.value.trim(),
      lastName: f.lastName.value.trim(),
      dateOfBirth: f.dateOfBirth.value,
      ssn: f.ssn.value.trim(),
      email: f.email.value.trim(),
      phone: f.phone.value.trim(),
      addressLine1: f.addressLine1.value.trim(),
      addressLine2: f.addressLine2.value.trim(),
      city: f.city.value.trim(),
      state: f.state.value,
      zip: f.zip.value.trim(),
      housingStatus: f.housingStatus.value,
      monthlyHousingPayment: num('monthlyHousingPayment'),
      employmentStatus: f.employmentStatus.value,
      annualIncome: num('annualIncome'),
      monthlyDebtPayments: num('monthlyDebtPayments'),
      creditScore: num('creditScore'),
      bankruptcyLast7Years: f.bankruptcyLast7Years.value === 'true',
      shippingMethod: f.shippingMethod.value,
      agreeToTerms: f.agreeToTerms.checked,
    };
  }

  function clearErrors() {
    formError.hidden = true;
    form.querySelectorAll('.field-error').forEach((el) => el.remove());
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function showFormError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showFieldErrors(details) {
    let first = null;
    for (const { field, message } of details) {
      const input = form.elements[field];
      const target = input && (input.length && !input.tagName ? input[0] : input);
      if (!target) continue;
      target.setAttribute('aria-invalid', 'true');
      const msg = document.createElement('div');
      msg.className = 'field-error';
      msg.dataset.testid = `error-${field}`;
      msg.textContent = message;
      if (field === 'agreeToTerms') form.querySelector('.terms').after(msg);
      else (target.closest('.field') || target.parentElement).append(msg);
      first = first || target;
    }
    showFormError(`Please correct ${details.length} field${details.length === 1 ? '' : 's'} highlighted below.`);
    if (first) first.focus({ preventScroll: true });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    submitBtn.disabled = true;
    processing.hidden = false;
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      if (res.status === 422) return showFieldErrors(body.details || []);
      if (!res.ok) return showFormError(body.error || `Unexpected error (${res.status})`);
      window.location.href = `result.html?id=${encodeURIComponent(body.applicationId)}`;
    } catch {
      showFormError('Could not reach the application service. Please try again.');
    } finally {
      submitBtn.disabled = false;
      processing.hidden = true;
    }
  });
})();
