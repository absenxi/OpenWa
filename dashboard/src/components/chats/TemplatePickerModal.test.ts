import '../../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MessageTemplate } from '../../services/api.ts';

let rtl: typeof import('@testing-library/react');
let queryClient: QueryClient;
let TemplatePickerModal: (typeof import('./TemplatePickerModal.tsx'))['TemplatePickerModal'];

let mockTemplates: MessageTemplate[] = [];

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();

  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/templates')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockTemplates), { headers: { 'Content-Type': 'application/json' } }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }));
  }) as typeof fetch;

  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');

  ({ TemplatePickerModal } = await import('./TemplatePickerModal.tsx'));
});

afterEach(() => {
  rtl.cleanup();
  queryClient?.clear();
  mockTemplates = [];
});

test('TemplatePickerModal renders templates and allows searching', async () => {
  const { screen, fireEvent, waitFor } = rtl;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  mockTemplates = [
    { id: '1', sessionId: 'sess-search', name: 'Greeting', body: 'Hello there!', createdAt: '', updatedAt: '' },
    { id: '2', sessionId: 'sess-search', name: 'Order Update', body: 'Order shipped', createdAt: '', updatedAt: '' },
  ];

  let selected: { tpl: MessageTemplate; vars?: Record<string, string> } | null = null;

  rtl.render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TemplatePickerModal, {
        open: true,
        onClose: () => undefined,
        sessionId: 'sess-search',
        canWrite: true,
        onSelect: (tpl, vars) => {
          selected = { tpl, vars };
        },
      }),
    ),
  );

  const greetingBtn = await screen.findByRole('button', { name: /Greeting/i });
  assert.ok(greetingBtn);

  // Search filter
  const searchInput = screen.getByPlaceholderText('Search templates...');
  fireEvent.change(searchInput, { target: { value: 'Order' } });

  await waitFor(() => assert.equal(screen.queryByText('Greeting'), null));
  assert.ok(screen.getByText('Order Update'));

  // Selecting template without vars immediately calls onSelect
  fireEvent.click(screen.getByRole('button', { name: /Order Update/i }));
  const res = selected as { tpl: MessageTemplate; vars?: Record<string, string> } | null;
  assert.equal(res?.tpl.id, '2');
});

test('TemplatePickerModal prompts for variables when template contains placeholders', async () => {
  const { screen, fireEvent } = rtl;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  mockTemplates = [
    {
      id: 'var-1',
      sessionId: 'sess-vars',
      name: 'Invoice',
      body: 'Hi {{name}}, your balance is {{amount}}.',
      createdAt: '',
      updatedAt: '',
    },
  ];

  let selected: { tpl: MessageTemplate; vars?: Record<string, string> } | null = null;

  rtl.render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TemplatePickerModal, {
        open: true,
        onClose: () => undefined,
        sessionId: 'sess-vars',
        canWrite: true,
        onSelect: (tpl, vars) => {
          selected = { tpl, vars };
        },
      }),
    ),
  );

  const invoiceBtn = await screen.findByRole('button', { name: /Invoice/i });
  fireEvent.click(invoiceBtn);

  // Variable inputs should be displayed
  const nameInput = screen.getByLabelText('name');
  const amountInput = screen.getByLabelText('amount');
  assert.ok(nameInput);
  assert.ok(amountInput);

  fireEvent.change(nameInput, { target: { value: 'Bob' } });
  fireEvent.change(amountInput, { target: { value: '$50' } });

  // Live preview verifies substitution
  assert.ok(screen.getByText('Hi Bob, your balance is $50.'));

  // Click Send
  fireEvent.click(screen.getByRole('button', { name: /Send Template/i }));

  const res = selected as { tpl: MessageTemplate; vars?: Record<string, string> } | null;
  assert.equal(res?.tpl.id, 'var-1');
  assert.deepEqual(res?.vars, { name: 'Bob', amount: '$50' });
});
