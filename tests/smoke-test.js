const BASE = 'http://localhost:3000';

(async () => {
  // Admin session
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bioderma.com', password: 'password123' }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  console.log('login:', login.status);

  const pages = ['/', '/orders', '/customers', '/products', '/production', '/inventory', '/offers', '/moderators', '/users', '/analytics', '/finance', '/ai-assistant', '/notifications', '/audit-logs', '/profile', '/settings', '/login', '/register', '/forgot-password', '/access-denied'];
  const apis = ['/api/orders', '/api/customers', '/api/products', '/api/offers', '/api/moderators', '/api/users', '/api/analytics', '/api/finance', '/api/inventory', '/api/notifications', '/api/audit-logs', '/api/settings', '/api/ai/daily-summary', '/api/auth/me', '/api/reports/export'];

  let failures = 0;

  console.log('\n── PAGES ──');
  for (const p of pages) {
    try {
      const res = await fetch(BASE + p, { headers: { Cookie: cookie }, redirect: 'manual' });
      const ok = res.status === 200;
      if (!ok) failures++;
      console.log(`${ok ? '✓' : '✗'} ${res.status} ${p}`);
    } catch (e) {
      failures++;
      console.log('✗ ERR', p, e.message);
    }
  }

  console.log('\n── APIs ──');
  for (const a of apis) {
    try {
      const res = await fetch(BASE + a, { headers: { Cookie: cookie } });
      const ok = res.status < 500;
      if (!ok) failures++;
      let extra = '';
      if (a === '/api/notifications') { const d = await res.json(); extra = `(unread: ${d.unreadCount})`; }
      if (a === '/api/orders') { const d = await res.json(); extra = `(total: ${d.pagination?.total})`; }
      if (a === '/api/analytics') { const d = await res.json(); extra = `(profit: ${d.financials?.netProfit})`; }
      console.log(`${ok ? '✓' : '✗'} ${res.status} ${a} ${extra}`);
    } catch (e) {
      failures++;
      console.log('✗ ERR', a, e.message);
    }
  }

  // Anonymous protection check
  console.log('\n── ANON PROTECTION ──');
  for (const a of ['/api/orders', '/api/finance', '/api/users', '/api/settings']) {
    const res = await fetch(BASE + a);
    const ok = res.status === 401 || res.status === 400;
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${res.status} ${a}`);
  }

  console.log(failures === 0 ? '\n✅ SMOKE TEST: ALL PASS' : `\n❌ ${failures} FAILURES`);
})();
