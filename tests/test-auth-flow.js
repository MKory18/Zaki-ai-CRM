const BASE = 'http://localhost:3000';
const stamp = Date.now();

async function j(method, url, body, cookie) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 60); }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie, location: res.headers.get('location') };
}

(async () => {
  const email = `flow${stamp}@test.com`;

  // 1. Sign Up -> PENDING_USER / PENDING
  const reg = await j('POST', '/api/auth/register', { fullName: 'مستخدم سير العمل', email, password: 'Strong123', confirmPassword: 'Strong123' });
  const userCookie = (reg.setCookie || '').split(';')[0];
  console.log('1. Sign Up:', reg.status, reg.data.status, reg.data.role);

  // 2. Session cookie set (auto-login) + Login page works again
  console.log('2. Session cookie set:', !!userCookie);

  // 3. Pending user redirected from /orders page by proxy
  const pageRedirect = await j('GET', '/orders', null, userCookie);
  console.log('3. PENDING visiting /orders ->', pageRedirect.status, pageRedirect.location || '(no redirect)');

  // 4. Pending user can access /pending
  const pendingPage = await j('GET', '/pending', null, userCookie);
  console.log('4. PENDING visiting /pending ->', pendingPage.status);

  // 5. Protected API blocked for PENDING
  const apiBlocked = await j('GET', '/api/orders', null, userCookie);
  console.log('5. PENDING API /api/orders ->', apiBlocked.status, JSON.stringify(apiBlocked.data).slice(0, 40));

  // 6. Admin approves: assigns MODERATOR + ACTIVE
  const admin = await j('POST', '/api/auth/login', { email: 'admin@bioderma.com', password: 'password123' });
  const adminCookie = (admin.setCookie || '').split(';')[0];

  const list = await j('GET', `/api/users?q=${email}`, null, adminCookie);
  const uid = list.data.users?.[0]?.id;

  await j('PATCH', `/api/users/${uid}`, { action: 'assignRole', role: 'MODERATOR' }, adminCookie);
  const act = await j('PATCH', `/api/users/${uid}`, { action: 'changeStatus', status: 'ACTIVE' }, adminCookie);
  console.log('6. Admin assigned MODERATOR + ACTIVE:', act.status, act.data.user?.role, act.data.user?.status);

  // 7. Re-login: session now carries ACTIVE/MODERATOR -> dashboard access
  const login2 = await j('POST', '/api/auth/login', { email, password: 'Strong123' });
  const cookie2 = (login2.setCookie || '').split(';')[0];
  console.log('7. Re-login:', login2.status, login2.data.status, login2.data.role);

  const dash = await j('GET', '/', null, cookie2);
  console.log('8. Moderator opens dashboard / ->', dash.status);

  // 9. Moderator blocked from /finance page by proxy -> Access Denied
  const fin = await j('GET', '/finance', null, cookie2);
  console.log('9. Moderator visiting /finance ->', fin.status, fin.location || '(allowed)');

  // 10. Moderator blocked from /users page
  const usr = await j('GET', '/users', null, cookie2);
  console.log('10. Moderator visiting /users ->', usr.status, usr.location || '(allowed)');

  // 11. Unauthenticated visitor -> /login
  const anon = await j('GET', '/orders', null, null);
  console.log('11. Anonymous visiting /orders ->', anon.status, anon.location || '(no redirect)');

  // 12. Logout destroys session server-side
  const logout = await j('POST', '/api/auth/logout', null, cookie2);
  const deadCookie = (logout.setCookie || '').split(';')[0];
  console.log('12. Logout:', logout.status);

  // 13. Old session cookie no longer works after logout (tokenVersion bumped)
  const afterLogout = await j('GET', '/api/auth/me', null, cookie2);
  console.log('13. Session after logout ->', afterLogout.status, '(401 expected)');

  // 14. Forgot password (dev token in dev mode only; prod start hides it)
  const forgot = await j('POST', '/api/auth/forgot-password', { email });
  console.log('14. Forgot password:', forgot.status, forgot.data.message ? 'generic message OK' : '?', forgot.data.devToken ? '(dev token)' : '(token hidden in prod)');

  // 15. Audit trail contains the auth events
  const audit = await j('GET', '/api/audit-logs', null, adminCookie);
  const actions = (audit.data.logs || []).map((l) => l.action);
  const found = ['USER_REGISTERED', 'USER_LOGGED_IN', 'USER_ROLE_CHANGED', 'USER_STATUS_CHANGED'].filter((a) => actions.includes(a));
  console.log('15. Audit events recorded:', found.join(', '));

  console.log('\n✅ COMPLETE AUTH FLOW TEST FINISHED');
})();
