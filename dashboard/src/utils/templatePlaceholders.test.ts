import '../test-helpers/register-hooks.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaceholders, renderTemplatePreview, PLACEHOLDER_PATTERN } from './templatePlaceholders.ts';

test('extractPlaceholders extracts double-brace and single-brace variables without duplicates', () => {
  const tpl = {
    header: 'Hello {{customer.name}}!',
    body: 'Your order {orderId} of {{item-name}} is ready. Contact {supportPhone} or {{customer.name}}.',
    footer: 'Thank you {orderId}',
  };
  const vars = extractPlaceholders(tpl);
  assert.deepEqual(vars, ['customer.name', 'orderId', 'item-name', 'supportPhone']);
});

test('extractPlaceholders handles null or missing header/footer', () => {
  assert.deepEqual(extractPlaceholders({ body: 'Hello {{user}}' }), ['user']);
  assert.deepEqual(extractPlaceholders({ header: null, body: 'No vars', footer: null }), []);
});

test('renderTemplatePreview substitutes provided variables and preserves unfilled placeholders', () => {
  const tpl = {
    header: 'Welcome {{name}}!',
    body: 'Your verification code is {{code}}.',
    footer: 'Expires in {minutes} minutes.',
  };
  const rendered = renderTemplatePreview(tpl, { name: 'Alice', code: '123456' });
  assert.equal(rendered, 'Welcome Alice!\n\nYour verification code is 123456.\n\nExpires in {minutes} minutes.');
});

test('renderTemplatePreview handles empty and whitespace-only variable substitutions', () => {
  const tpl = { body: 'Hello {{name}}, welcome to {{place}}' };
  // Empty string variable leaves placeholder literal (consistent with backend renderer)
  const rendered = renderTemplatePreview(tpl, { name: '', place: 'OpenWA' });
  assert.equal(rendered, 'Hello {{name}}, welcome to OpenWA');
});

test('PLACEHOLDER_PATTERN regex matches expected patterns', () => {
  const sample = '{{a}} {b} {{c.d}} {{e-f}}';
  const matches = [...sample.matchAll(PLACEHOLDER_PATTERN)].map(m => m[1] ?? m[2]);
  assert.deepEqual(matches, ['a', 'b', 'c.d', 'e-f']);
});
