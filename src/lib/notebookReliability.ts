import type { MockNotebook, MockNotebookMember, NotebookEntry } from '@/lib/types';

export type UserFacingErrorContext = 'create' | 'join' | 'leave' | 'unlock' | 'generic';

export function mapErrorToUserMessage(err: unknown, context: UserFacingErrorContext): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  const message =
    typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message).toLowerCase() : '';

  if (context === 'join') {
    if (code === '42501' || message.includes('row-level security')) return 'Yetki problemi: Bu kitaba katilma izniniz yok.';
    if (code === '23505' || message.includes('duplicate')) return 'Bu kitaba zaten baglisiniz.';
    if (message.includes('full') || message.includes('space')) return 'Bu kitap dolu (en fazla 2 kisi).';
    if (message.includes('invalid invite') || message.includes('invalid code')) return 'Kod gecersiz. Lutfen davet kodunu kontrol edin.';
    return 'Kitaba katilirken bir hata olustu. Lutfen tekrar deneyin.';
  }

  if (context === 'leave') return 'Kitaptan ayrilirken bir hata olustu. Lutfen tekrar deneyin.';
  if (context === 'unlock') return 'Kilit acilirken bir hata olustu. Lutfen tekrar deneyin.';
  if (context === 'create') return 'Kitap olusturulurken bir hata olustu. Lutfen tekrar deneyin.';
  return 'Bir hata olustu. Lutfen tekrar deneyin.';
}

function parseJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function persistDemoData(next: {
  notebooks?: MockNotebook[];
  members?: MockNotebookMember[];
  entries?: NotebookEntry[];
}): void {
  if (next.notebooks) localStorage.setItem('mock_notebooks', JSON.stringify(next.notebooks));
  if (next.members) localStorage.setItem('mock_notebook_members', JSON.stringify(next.members));
  if (next.entries) localStorage.setItem('mock_notebook_entries', JSON.stringify(next.entries));
  localStorage.setItem('mock_notebook_members_trigger', Date.now().toString());
}

export function leaveCurrentNotebookInDemoMode(notebookId: string, userId: string): void {
  const notebooks = parseJson<MockNotebook[]>('mock_notebooks', []);
  const members = parseJson<MockNotebookMember[]>('mock_notebook_members', []);
  const entries = parseJson<NotebookEntry[]>('mock_notebook_entries', []);

  const nextMembers = members.filter((m) => !(m.notebook_id === notebookId && m.user_id === userId));
  const hasAnyMember = nextMembers.some((m) => m.notebook_id === notebookId);

  const nextNotebooks = hasAnyMember ? notebooks : notebooks.filter((n) => n.id !== notebookId);
  const nextEntries = hasAnyMember ? entries : entries.filter((e) => e.notebook_id !== notebookId);

  persistDemoData({ notebooks: nextNotebooks, members: nextMembers, entries: nextEntries });
}

