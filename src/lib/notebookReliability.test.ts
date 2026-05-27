import { describe, expect, it } from 'vitest';
import { mapErrorToUserMessage } from './notebookReliability';

describe('mapErrorToUserMessage', () => {
  it('maps timeout/network errors to connection delay message', () => {
    const timeoutMsg = mapErrorToUserMessage({ code: 'JOIN_TIMEOUT', message: 'operation timed out' }, 'join');
    const networkMsg = mapErrorToUserMessage({ message: 'Failed to fetch' }, 'create');

    expect(timeoutMsg).toBe('Baglanti gecikmesi. Lutfen tekrar deneyin.');
    expect(networkMsg).toBe('Baglanti gecikmesi. Lutfen tekrar deneyin.');
  });

  it('maps join invalid invite before other generic cases', () => {
    const msg = mapErrorToUserMessage({ message: 'INVALID CODE' }, 'join');
    expect(msg).toBe('Kod gecersiz. Lutfen davet kodunu kontrol edin.');
  });

  it('maps join full and permission errors correctly', () => {
    const fullMsg = mapErrorToUserMessage({ message: 'notebook is full' }, 'join');
    const permissionMsg = mapErrorToUserMessage({ code: '42501', message: 'row-level security policy violated' }, 'join');

    expect(fullMsg).toBe('Bu kitap dolu (en fazla 2 kisi).');
    expect(permissionMsg).toBe('Yetki problemi: Bu kitaba katilma izniniz yok.');
  });
});

