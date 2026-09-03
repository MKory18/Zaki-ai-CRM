const BASE = 'http://localhost:3000';

async function j(method, url, body, cookie) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 100); }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie };
}

(async () => {
  // 1. Weak password rejected
  let r = await j('POST', '/api/auth/register', { fullName: 'weak', email: 'weak1@test.com', password: '123', confirmPassword: '123' });
  console.log('1. Weak password:', r.status, JSON.stringify(r.data).slice(0, 80));

  // 2. Duplicate email rejected
  r = await j('POST', '/api/auth/register', { fullName: 'dup', email: 'newuser@test.com', password: 'Test1234', confirmPassword: 'Test1234' });
  console.log('2. Duplicate email:', r.status, JSON.stringify(r.data).slice(0, 60));

  // 3. Login as pending user, try protected API
  const login = await j('POST', '/api/auth/login', { email: 'newuser@test.com', password: 'Test1234' });
  const cookie = (login.setCookie || '').split(';')[0];
  console.log('3. Pending login:', login.status, 'status=' + login.data.status);

  const blocked = await j('GET', '/api/orders', null, cookie);
  console.log('4. Protected API for PENDING user:', blocked.status, JSON.stringify(blocked.data).slice(0, 60));

  // 5. Admin login + view users + assign role
  const admin = await j('POST', '/api/auth/login', { email: 'admin@bioderma.com', password: 'password123' });
  const adminCookie = (admin.setCookie || '').split(';')[0];
  console.log('5. Admin login:', admin.status, admin.data.user?.role);

  const list = await j('GET', '/api/users?q=newuser', null, adminCookie);
  const pendingUser = list.data.users?.[0];
  console.log('6. Admin users list:', list.status, 'found:', pendingUser?.name, pendingUser?.role, pendingUser?.status);

  // 6. Assign MODERATOR + activate
  const patch = await j('PATCH', `/api/users/${pendingUser.id}`, { action: 'assignRole', role: 'MODERATOR' }, adminCookie);
  console.log('7. Assign MODERATOR:', patch.status, patch.data.user?.role);
  const activate = await j('PATCH', `/api/users/${pendingUser.id}`, { action: 'changeStatus', status: 'ACTIVE' }, adminCookie);
  console.log('8. Activate account:', activate.status, activate.data.user?.status);

  // 7. Pending user (now active moderator) can access orders
  const ok = await j('GET', '/api/orders?page=1&limit=1', null, cookie);
  console.log('9. Previously-pending user now accesses orders:', ok.status, 'orders:', ok.data.orders?.length);

  // 8. Suspended user blocked
  await j('PATCH', `/api/users/${pendingUser.id}`, { action: 'changeStatus', status: 'SUSPENDED' }, adminCookie);
  const sus = await j('GET', '/api/orders', null, cookie);
  console.log('10. SUSPENDED user blocked from API:', sus.status, JSON.stringify(sus.data).slice(0, 50));

  // Reactivate
  await j('PATCH', `/api/users/${pendingUser.id}`, { action: 'changeStatus', status: 'ACTIVE' }, adminCookie);

  // 9. Non-admin cannot manage users
  const noPerm = await j('GET', '/api/users', null, cookie);
  console.log('11. MODERATOR denied users API:', noPerm.status, JSON.stringify(noPerm.data).slice(0, 60));

  // 10. Audit log recorded role change
  const audit = await j('GET', '/api/audit-logs', null, adminCookie);
  const roleChange = audit.data.logs?.find((l) => l.action === 'USER_ROLE_CHANGED');
  console.log('12. Audit log USER_ROLE_CHANGED:', roleChange ? `${roleChange.previousData?.role} -> ${roleChange.newData?.role} by ${roleChange.newData?.changedBy}` : 'NOT FOUND');

  // 11. Forgot password returns token (dev)
  const forgot = await j('POST', '/api/auth/forgot-password', { email: 'newuser@test.com' });
  console.log('13. Forgot password devToken:', forgot.status, forgot.data.devToken ? 'token issued' : 'no token');

  // Reset password with token
  const reset = await j('POST', '/api/auth/reset-password', { token: forgot.data.devToken, password: 'NewPass123', confirmPassword: 'NewPass123' });
  console.log('14. Reset password:', reset.status, reset.data.success ? 'OK' : JSON.stringify(reset.data).slice(0, 60));

  // Login with new password
  const newLogin = await j('POST', '/api/auth/login', { email: 'newuser@test.com', password: 'NewPass123' });
  console.log('15. Login with new password:', newLogin.status, newLogin.data.user?.role);

  // 12. Rate limiting on login (brute force)
  let rateLimited = false;
  for (let i = 0; i < 10; i++) {
    const rr = await j('POST', '/api/auth/login', { email: 'ratelimit@test.com', password: 'WrongPass9' });
    if (rr.status === 429) { rateLimited = true; console.log(`16. Rate limit hit after ${i + 1} attempts:`, rr.data.error?.slice(0, 50)); break; }
  }
  if (!rateLimited) console.log('16. Rate limit: NOT triggered (check config)');

  console.log('\n✅ ALL AUTH TESTS COMPLETE');
})();
