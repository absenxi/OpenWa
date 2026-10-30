// A picked file is staged only once FileReader has read it. Sending text in that window must not throw the
// file away: the operator saw no banner, so nothing would tell them it was dropped.
import '../../test-helpers/register-hooks.ts';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useState, type ReactNode } from 'react';
import type { Chat } from '../../services/api.ts';
import type { ChatMessageView } from '../../utils/chatMessages.ts';
import type { StagedAttachment } from './ChatComposer.tsx';

let rtl: typeof import('@testing-library/react');
let ChatComposer: (typeof import('./ChatComposer.tsx'))['default'];
let wrap: (children: ReactNode, canWrite?: boolean) => ReactNode;
let queryClient: import('@tanstack/react-query').QueryClient;

// Reads held until the test finishes them, so a send can land while one is still in flight.
const heldReads: Array<() => void> = [];
class HeldFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  readAsDataURL(): void {
    heldReads.push(() => this.onload?.({ target: { result: 'data:application/pdf;base64,JVBERi0=' } }));
  }
}

// Request paths and bodies the composer sent, in order.
const sentPaths: string[] = [];
const sentBodies: Array<unknown> = [];

const chat: Chat = {
  id: 'alice@c.us',
  name: 'Alice',
  isGroup: false,
  kind: 'individual',
  unreadCount: 0,
  timestamp: 0,
  archived: false,
  pinned: false,
  muted: false,
};

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  (globalThis as Record<string, unknown>).FileReader = HeldFileReader;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost').pathname;
    sentPaths.push(path);
    if (init?.body) {
      try {
        sentBodies.push(JSON.parse(init.body as string));
      } catch {
        sentBodies.push(init.body);
      }
    }
    if (path.includes('/templates')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 'tpl-1',
              sessionId: 'sess-1',
              name: 'Quick Hello',
              body: 'Hello there!',
              createdAt: '',
              updatedAt: '',
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ messageId: 'sent-1' }), { headers: { 'Content-Type': 'application/json' } }),
    );
  }) as typeof fetch;
  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { ToastProvider } = await import('../Toast.tsx');
  const { RoleContext } = await import('../../hooks/useRole.tsx');
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  wrap = (children, canWrite = true) => {
    const role = {
      role: (canWrite ? 'admin' : 'viewer') as 'admin' | 'viewer',
      setRole: () => undefined,
      isAdmin: canWrite,
      isOperator: false,
      isViewer: !canWrite,
      canWrite,
      engineType: null,
      setEngineType: () => undefined,
      scoped: false,
      setScoped: () => undefined,
    };
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RoleContext.Provider, { value: role }, createElement(ToastProvider, null, children)),
    );
  };
  ({ default: ChatComposer } = await import('./ChatComposer.tsx'));
});

afterEach(() => {
  rtl.cleanup();
  queryClient?.clear();
  heldReads.length = 0;
  sentPaths.length = 0;
  sentBodies.length = 0;
});

after(() => rtl.cleanup());

function Harness({ reply = null, sessionId = 'sess-1' }: { reply?: ChatMessageView | null; sessionId?: string }) {
  const [messageInput, setMessageInput] = useState('');
  const [attachment, setAttachment] = useState<StagedAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageView | null>(reply);
  return createElement(ChatComposer, {
    selectedSessionId: sessionId,
    activeChat: chat,
    replyingTo,
    setReplyingTo,
    onMessageAppended: () => undefined,
    onSent: () => undefined,
    messageInput,
    setMessageInput,
    attachment,
    setAttachment,
    previewUrl,
    setPreviewUrl,
  });
}

test('sending text while a picked file is still being read keeps the file', async () => {
  const { screen, fireEvent, act, waitFor } = rtl;
  const { container } = rtl.render(wrap(createElement(Harness)));

  fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'see attached' } });
  const file = new window.File(['%PDF-1.4 stub'], 'contract.pdf', { type: 'application/pdf' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  assert.equal(heldReads.length, 1);

  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => assert.equal((screen.getByPlaceholderText('Type a message...') as HTMLInputElement).value, ''));
  await act(async () => heldReads[0]());

  assert.equal(
    container.querySelector('.preview-filename')?.textContent,
    'contract.pdf',
    'the picked file was dropped',
  );
});

test('sending while a replacement pick is still being read sends neither file and stages the new one', async () => {
  const { screen, fireEvent, act, waitFor } = rtl;
  const { container } = rtl.render(wrap(createElement(Harness)));
  const fileInput = container.querySelector('input[type="file"]')!;

  const first = new window.File(['%PDF-1.4 old'], 'old.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [first] } });
  await act(async () => heldReads[0]());
  assert.equal(container.querySelector('.preview-filename')?.textContent, 'old.pdf');

  // The replacement is still being read when the operator sends: the file it replaces must not go out.
  const second = new window.File(['%PDF-1.4 new'], 'new.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [second] } });
  fireEvent.change(container.querySelector('.message-text-input')!, { target: { value: 'see attached' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => assert.equal(sentPaths.length, 1));
  assert.deepEqual(sentPaths, ['/api/sessions/sess-1/messages/send-text'], 'the replaced file was sent');
  await act(async () => heldReads[1]());

  assert.equal(
    container.querySelector('.preview-filename')?.textContent,
    'new.pdf',
    'the replacement pick was dropped',
  );
});

test('the attachment and reply banners name the buttons that close them', async () => {
  const { screen, fireEvent, act } = rtl;
  const reply = {
    id: 'm1',
    waMessageId: 'wamid.1',
    chatId: chat.id,
    body: 'see you at noon',
    type: 'text',
    direction: 'incoming',
    status: 'read',
    timestamp: 1_700_000_000,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as ChatMessageView;
  const { container } = rtl.render(wrap(createElement(Harness, { reply })));
  const file = new window.File(['%PDF-1.4 stub'], 'contract.pdf', { type: 'application/pdf' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await act(async () => heldReads[0]());

  fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
  assert.equal(container.querySelector('.attachment-preview-banner') === null, true, 'the file stayed staged');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  assert.equal(container.querySelector('.replying-preview-banner') === null, true, 'the reply stayed open');
});

test('template picker button opens modal and displays session templates', async () => {
  const { screen, fireEvent } = rtl;
  rtl.render(wrap(createElement(Harness)));

  const templateBtn = screen.getByRole('button', { name: 'Templates' });
  assert.ok(templateBtn);
  assert.equal((templateBtn as HTMLButtonElement).disabled, false);

  fireEvent.click(templateBtn);

  const tplItem = await screen.findByRole('button', { name: /Quick Hello/i });
  assert.ok(tplItem);
});

test('template picker button is disabled for read-only users or empty session', () => {
  const { screen } = rtl;
  // Read-only user
  const { unmount } = rtl.render(wrap(createElement(Harness), false));
  const templateBtnReadOnly = screen.getByRole('button', { name: 'Templates' }) as HTMLButtonElement;
  assert.equal(templateBtnReadOnly.disabled, true);
  unmount();

  // Empty session
  rtl.render(wrap(createElement(Harness, { sessionId: '' }), true));
  const templateBtnNoSession = screen.getByRole('button', { name: 'Templates' }) as HTMLButtonElement;
  assert.equal(templateBtnNoSession.disabled, true);
});

test('sending a template calls send-template and preserves composer draft text', async () => {
  const { screen, fireEvent, waitFor } = rtl;
  rtl.render(wrap(createElement(Harness)));

  // Type an uncommitted draft in composer input
  const textInput = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
  fireEvent.change(textInput, { target: { value: 'My unfinished draft' } });
  assert.equal(textInput.value, 'My unfinished draft');

  // Open template picker and select template
  const templateBtn = screen.getByRole('button', { name: 'Templates' });
  fireEvent.click(templateBtn);

  const tplItem = await screen.findByRole('button', { name: /Quick Hello/i });
  fireEvent.click(tplItem);

  // Verify send-template request was made with correct payload
  await waitFor(() => {
    assert.ok(sentPaths.includes('/api/sessions/sess-1/messages/send-template'));
  });

  const sendPayload = sentBodies.find(b => (b as { templateId?: string })?.templateId === 'tpl-1') as {
    chatId: string;
    templateId: string;
  };
  assert.ok(sendPayload);
  assert.equal(sendPayload.chatId, 'alice@c.us');
  assert.equal(sendPayload.templateId, 'tpl-1');

  // Verify the composer draft text is completely preserved
  assert.equal(textInput.value, 'My unfinished draft');
});
