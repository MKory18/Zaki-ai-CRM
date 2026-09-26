import { NextResponse } from 'next/server';

interface Ctx {
  params: Promise<{ slug: string }>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Public (no login): a tiny, static, hard-coded bootstrap script injected
 * into uploaded landing page HTML. It only ever talks to the two public
 * endpoints (meta + orders) with credentials: 'omit' — the CRM session
 * cookie is never sent (the page itself also runs in a sandboxed iframe
 * without allow-same-origin, so the browser withholds cookies entirely).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  // The script reads the slug from its own src (hard-coded server-side),
  // not from window.location — so it works identically in the public page
  // and in the dashboard preview iframe.
  const script = `(function () {
  'use strict';
  var SLUG = ${JSON.stringify(slug)};
  var SCRIPTS = document.currentScript ? document.currentScript.src : '';
  var m = SCRIPTS.match(/\\/api\\/public\\/landing-pages\\/([a-z0-9-]+)\\/form\\.js/);
  if (m && m[1]) SLUG = m[1];
  var API = '/api/public/landing-pages/' + encodeURIComponent(SLUG);

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text) e.textContent = text;
    return e;
  }

  function buildForm(meta) {
    var host = document.getElementById('zaki-order-form') || document.querySelector('[data-zaki-order-form]');
    if (!host) return;
    var form = document.createElement('form');
    form.setAttribute('id', 'zaki-order-form-element');
    form.setAttribute('novalidate', 'novalidate');

    function field(name, label, type, required, extra) {
      var wrap = document.createElement('div');
      var lbl = document.createElement('label');
      lbl.setAttribute('for', 'zf-' + name);
      lbl.textContent = label + (required(name) ? ' *' : '');
      var input = document.createElement(extra === 'textarea' ? 'textarea' : 'input');
      input.id = 'zf-' + name;
      input.name = name;
      if (extra !== 'textarea') input.type = extra || 'text';
      wrap.appendChild(lbl); wrap.appendChild(input); form.appendChild(wrap);
    }
    var required = function (n) { return ['full_name','phone','address','city'].indexOf(n) !== -1; };

    var price = (meta.product && meta.product.price) || 0;
    var head = document.createElement('div');
    head.textContent = meta.product ? (meta.product.name || '') + ' — ' + price + ' ' + (meta.company.currency || 'USD') : '';
    form.appendChild(head);

    /*
      Always Arabic, because this form is Arabic. What was here chose the
      label's language by whether the COMPANY HAS A NAME — which it always
      does: the field is required with a minimum of two characters. The
      condition was never false, the English half was unreachable, and the
      line read as a language switch while being nothing of the kind.

      (No back-ticks in this comment: the whole of this file's body is a
      template literal, and one would end it.)
    */
    field('full_name', 'الاسم الكامل', 'text');
    field('phone', 'الهاتف', 'tel');
    field('address', 'العنوان', 'text');
    field('city', 'المدينة', 'text');
    field('quantity', 'الكمية', 'number');
    field('notes', 'ملاحظات', 'text', 'textarea');

    // Honeypot: hidden field that only bots fill
    var hpWrap = document.createElement('div');
    hpWrap.style.position = 'absolute'; hpWrap.style.left = '-9999px';
    hpWrap.setAttribute('aria-hidden', 'true');
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off';
    hpWrap.appendChild(hp); form.appendChild(hpWrap);

    var msg = document.createElement('div');
    form.appendChild(msg);

    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = 'إرسال الطلب';
    form.appendChild(btn);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg.textContent = '';
      var data = {
        full_name: form.querySelector('[name=full_name]').value.trim(),
        phone: form.querySelector('[name=phone]').value.trim(),
        address: form.querySelector('[name=address]').value.trim(),
        city: form.querySelector('[name=city]').value.trim(),
        quantity: form.querySelector('[name=quantity]').value.trim() || '1',
        notes: form.querySelector('[name=notes]').value.trim(),
        website: hp.value,
        ts: String(Date.now())
      };
      btn.disabled = true;
      msg.textContent = 'جارٍ الإرسال…';
      fetch(API + '/orders', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            msg.textContent = 'تم استلام طلبك بنجاح! رقم الطلب: ' + (res.j.orderNumber || '');
            form.reset();
          } else {
            msg.textContent = (res.j && res.j.error) || 'تعذر إرسال الطلب';
            btn.disabled = false;
          }
        })
        .catch(function () {
          msg.textContent = 'تعذر إرسال الطلب';
          btn.disabled = false;
        });
    });

    host.innerHTML = '';
    host.appendChild(form);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else { load(); }

  function load() {
    fetch(API + '/meta', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (meta) { if (meta) buildForm(meta); })
      .catch(function () {});
  }
})();`;

  return new NextResponse(script, {
    headers: {
      ...CORS,
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}