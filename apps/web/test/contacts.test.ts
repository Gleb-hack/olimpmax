import assert from 'node:assert/strict';
import test from 'node:test';
import { mailtoUrl, parseContact } from '../src/lib/contacts.ts';

test('email opens the mail app with the address', () => {
  assert.deepEqual(parseContact(' olymp@hse.ru '), { kind: 'email', label: 'olymp@hse.ru', href: 'mailto:olymp@hse.ru' });
  assert.equal(mailtoUrl('a@b.ru', 'Вопрос'), 'mailto:a@b.ru?subject=%D0%92%D0%BE%D0%BF%D1%80%D0%BE%D1%81');
});

test('phone opens the dialer with digits only', () => {
  assert.deepEqual(parseContact('+7 (495) 123-45-67'), { kind: 'phone', label: '+7 (495) 123-45-67', href: 'tel:+74951234567' });
});

test('site keeps its path and gets https', () => {
  assert.deepEqual(parseContact('olymp.msu.ru'), { kind: 'site', label: 'olymp.msu.ru', href: 'https://olymp.msu.ru/' });
  assert.deepEqual(parseContact('https://www.example.org/olymp?x=1'), { kind: 'site', label: 'example.org/olymp?x=1', href: 'https://www.example.org/olymp?x=1' });
});

test('a path cut to "/..." by the import opens the home page', () => {
  assert.deepEqual(parseContact('rsuh.ru/...'), { kind: 'site', label: 'rsuh.ru', href: 'https://rsuh.ru/' });
});

test('social networks are named', () => {
  assert.deepEqual(parseContact('vk.com/...'), { kind: 'social', label: 'ВКонтакте', href: 'https://vk.com/' });
  assert.deepEqual(parseContact('https://t.me/olimp'), { kind: 'social', label: 'Telegram', href: 'https://t.me/olimp' });
});

test('punycode domains are links', () => {
  assert.equal(parseContact('xn--80ad.xn--b1aew.xn--p1ai/...').kind, 'site');
});

test('unrecognised text stays plain text', () => {
  for (const value of ['О сайте', 'search-cross', 'ВКонтакте', 'javascript:alert(1)', 'mail@', '12-34', '']) {
    const contact = parseContact(value);
    assert.equal(contact.kind, 'text', value);
    assert.equal(contact.href, undefined);
  }
});
