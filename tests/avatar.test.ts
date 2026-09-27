import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Avatar, ProfilePatch } from '../packages/contracts/src/index.js';

const dataUrl = (type: string, bytes: Buffer) => `data:image/${type};base64,${bytes.toString('base64')}`;

test('profile photos allow supported image signatures and reject URLs, SVG and mismatched types', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  for (const [type, bytes] of [['png', png], ['jpeg', Buffer.from('ffd8ffe0', 'hex')], ['webp', Buffer.from('RIFF0000WEBP')]] as const) {
    assert.equal(Avatar.parse(dataUrl(type, bytes)), dataUrl(type, bytes));
  }
  for (const value of ['https://example.com/photo.jpg', dataUrl('svg+xml', Buffer.from('<svg/>')), dataUrl('jpeg', png), 'data:image/png;base64,!!!']) {
    assert.equal(Avatar.safeParse(value).success, false);
  }
  assert.deepEqual(ProfilePatch.parse({ avatar: null }), { avatar: null });
  assert.deepEqual(ProfilePatch.parse({ name: 'Анна' }), { name: 'Анна' });
});

test('profile photos enforce the one MiB decoded size limit', () => {
  const bytes = Buffer.alloc(1024 * 1024);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  assert.equal(Avatar.safeParse(dataUrl('png', bytes)).success, true);
  assert.equal(Avatar.safeParse(dataUrl('png', Buffer.concat([bytes, Buffer.from([0])]))).success, false);
});
