import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CurrentUser } from './types.js';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_SESSION_SECRET = 'test-session-secret';

const vendor: CurrentUser = {
  id: 'user-1',
  email: 'vendor@example.com',
  name: 'Vendor',
  picture: null,
  provider: 'google',
  admin: true,
  profileComplete: true,
};

test('a session lasts seven days and administrator access follows the email address', async () => {
  const { signSession, verifySession } = await import('./auth.js');
  const session = await signSession(vendor);
  assert.ok(session.expiresAt > Date.now() + 6 * 24 * 60 * 60 * 1000);
  const verified = await verifySession(session.token);
  assert.equal(verified.admin, false);
  assert.equal(verified.email, vendor.email);
  assert.equal(verified.profileComplete, false);

  const admin = await signSession({ ...vendor, id: 'admin-1', email: 'Andrew@bishop4.com', admin: false });
  const verifiedAdmin = await verifySession(admin.token);
  assert.equal(verifiedAdmin.admin, true);
  await assert.rejects(() => verifySession(`${session.token}tampered`));
});
