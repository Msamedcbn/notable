const keyStorage = (notebookId: string) => `notebook_key_${notebookId}`;
const keyRingStorage = (notebookId: string) => `notebook_keyring_${notebookId}`;

export function getPrimaryNotebookKey(notebookId: string): string {
  return localStorage.getItem(keyStorage(notebookId)) || '';
}

export function getNotebookKeyring(notebookId: string): string[] {
  const primary = getPrimaryNotebookKey(notebookId).trim();
  const raw = localStorage.getItem(keyRingStorage(notebookId));
  let keys: string[] = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        keys = parsed.filter((item) => typeof item === 'string');
      }
    } catch {
      keys = [];
    }
  }

  if (primary) {
    keys.unshift(primary);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const normalized = key.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export function rememberNotebookKey(notebookId: string, key: string): void {
  const normalized = key.trim();
  if (!normalized) return;

  localStorage.setItem(keyStorage(notebookId), normalized);
  const ring = getNotebookKeyring(notebookId);
  if (!ring.includes(normalized)) {
    ring.unshift(normalized);
  }
  localStorage.setItem(keyRingStorage(notebookId), JSON.stringify(ring.slice(0, 10)));
}
