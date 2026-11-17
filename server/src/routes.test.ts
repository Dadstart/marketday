import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { locationFromPath, locationFromUrl, pathForLocation } from '../../client/src/routes.js';

const eventId = '11bde5d5-482a-49e5-96d4-391b34716a67';
const userId = '8f1c2b3a-4d5e-4f60-8172-93a4b5c6d7e8';

describe('app addresses', () => {
  test('reads an event, a profile, and a user from a path', () => {
    assert.deepEqual(locationFromPath(`/events/${eventId}`), { screen: 'event', eventId });
    assert.deepEqual(locationFromPath('/profile/'), { screen: 'profile' });
    assert.deepEqual(locationFromPath('/users'), { screen: 'users' });
    assert.deepEqual(locationFromPath(`/users/${userId}`), { screen: 'user', userId });
    assert.deepEqual(locationFromPath('/'), { screen: 'events' });
    assert.deepEqual(locationFromPath('/events/not-an-event'), { screen: 'events' });
    assert.deepEqual(locationFromPath('/privacy.html'), { screen: 'events' });
  });

  test('reads the same addresses from a site URL or an app link', () => {
    assert.deepEqual(locationFromUrl(`https://crosswindscommunityday.com/events/${eventId}`), {
      screen: 'event',
      eventId,
    });
    assert.deepEqual(locationFromUrl('marketday://profile'), { screen: 'profile' });
    assert.deepEqual(locationFromUrl(`marketday://users/${userId}`), { screen: 'user', userId });
    assert.deepEqual(pathForLocation({ screen: 'event', eventId }), `/events/${eventId}`);
    assert.equal(pathForLocation({ screen: 'profile' }), '/profile');
    assert.equal(pathForLocation({ screen: 'users' }), '/users');
    assert.equal(pathForLocation({ screen: 'user', userId }), `/users/${userId}`);
    assert.equal(pathForLocation({ screen: 'events' }), '/');
  });
});
