'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import NotebookBook from '@/components/NotebookBook';
import { BookOpen, Sparkles, Heart, Key, Share2, Clipboard, Check, LogOut } from 'lucide-react';
import { decryptContent, decryptContentWithSecrets, DECRYPTION_FAILED_MARKER, ENCRYPTION_PREFIX } from '@/lib/crypto';
import { getNotebookKeyring, rememberNotebookKey } from '@/lib/keyring';
import { MockNotebook, MockNotebookMember, NotebookEntry } from '@/lib/types';
import { leaveCurrentNotebookInDemoMode, mapErrorToUserMessage } from '@/lib/notebookReliability';
import { DEFAULT_TIMEOUT_MS, withTimeout } from '@/lib/async';

export default function HomePage() {
  const { user, notebookId, loading, refreshNotebookId, signOut, setMockNotebookId } = useAuth();
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupLocked, setSetupLocked] = useState(false);
  const [setupMode, setSetupMode] = useState<'create' | 'join' | null>(null);
  const [setupError, setSetupError] = useState('');
  const [setupErrorNotebookId, setSetupErrorNotebookId] = useState<string | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [leaveErrorNotebookId, setLeaveErrorNotebookId] = useState<string | null>(null);

  // E2EE States
  const [createPassword, setCreatePassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockErrorNotebookId, setUnlockErrorNotebookId] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);
  
  // Setup inputs
  const [newNotebookName, setNewNotebookName] = useState('Our Story');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  
  // Pairing status details
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isAlone, setIsAlone] = useState(false);
  const [copied, setCopied] = useState(false);
  const fetchSeqRef = useRef(0);
  const activeNotebookRef = useRef<string | null>(null);
  const setupActionLockRef = useRef(false);

  const router = useRouter();

  useEffect(() => {
    activeNotebookRef.current = notebookId;
  }, [notebookId]);

  const setSetupErrorForCurrent = (message: string) => {
    setSetupErrorNotebookId(notebookId);
    setSetupError(message);
  };

  const setLeaveErrorForCurrent = (message: string) => {
    setLeaveErrorNotebookId(notebookId);
    setLeaveError(message);
  };

  const setUnlockErrorForCurrent = (message: string) => {
    setUnlockErrorNotebookId(notebookId);
    setUnlockError(message);
  };

  const runSetupAction = async (mode: 'create' | 'join', action: () => Promise<void>) => {
    if (setupActionLockRef.current) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`Setup action blocked: ${mode}`);
      }
      return;
    }

    setupActionLockRef.current = true;
    setSetupLocked(true);
    setSetupLoading(true);
    setSetupMode(mode);
    setSetupErrorForCurrent('');

    try {
      await action();
    } finally {
      setSetupLoading(false);
      setSetupLocked(false);
      setSetupMode(null);
      setupActionLockRef.current = false;
    }
  };

  const isRpcMissingError = (err: unknown): boolean => {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    const message =
      typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message).toLowerCase() : '';

    return (
      code === 'PGRST202' ||
      message.includes('could not find the function') ||
      message.includes('function') && message.includes('not found') ||
      message.includes('schema cache')
    );
  };

  const createViaFallback = async (notebookName: string, userEmail: string, password: string) => {
    const { data: notebook, error: nError } = await withTimeout(
      supabase
        .from('notebooks')
        .insert({ name: notebookName })
        .select()
        .single(),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_CREATE_NOTEBOOK_TIMEOUT'
    );

    if (nError) throw nError;

    const { error: mError } = await withTimeout(
      supabase
        .from('notebook_members')
        .insert({
          notebook_id: notebook.id,
          user_id: user!.id,
          user_email: userEmail,
        }),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_CREATE_MEMBERSHIP_TIMEOUT'
    );

    if (mError) throw mError;

    rememberNotebookKey(notebook.id, password);
    await refreshNotebookId();
  };

  const joinViaFallback = async (code: string, userEmail: string, password: string) => {
    const { data: notebook, error: nError } = await withTimeout(
      supabase
        .from('notebooks')
        .select('*')
        .eq('invite_code', code)
        .maybeSingle(),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_LOOKUP_NOTEBOOK_TIMEOUT'
    );

    if (nError) throw nError;

    if (!notebook) {
      setSetupErrorForCurrent('Kod gecersiz. Lutfen davet kodunu kontrol edin.');
      return;
    }

    const { data: existingMembership, error: existingMembershipError } = await withTimeout(
      supabase
        .from('notebook_members')
        .select('notebook_id')
        .eq('notebook_id', notebook.id)
        .eq('user_id', user!.id)
        .maybeSingle(),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_CHECK_ALREADY_MEMBER_TIMEOUT'
    );

    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership) {
      rememberNotebookKey(notebook.id, password);
      await refreshNotebookId();
      return;
    }

    const { count, error: countError } = await withTimeout(
      supabase
        .from('notebook_members')
        .select('*', { count: 'exact', head: true })
        .eq('notebook_id', notebook.id),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_COUNT_MEMBERS_TIMEOUT'
    );

    if (countError) throw countError;

    if ((count ?? 0) >= 2) {
      setSetupErrorForCurrent('Bu kitap dolu (en fazla 2 kisi).');
      return;
    }

    const { error: mError } = await withTimeout(
      supabase
        .from('notebook_members')
        .insert({
          notebook_id: notebook.id,
          user_id: user!.id,
          user_email: userEmail,
        }),
      DEFAULT_TIMEOUT_MS,
      'FALLBACK_JOIN_MEMBERSHIP_TIMEOUT'
    );

    if (mError) {
      if (mError.code === '23505') {
        rememberNotebookKey(notebook.id, password);
        await refreshNotebookId();
        return;
      }
      if (mError.code === '42501' || mError.message.toLowerCase().includes('row-level security')) {
        setSetupErrorForCurrent('Yetki problemi: Bu kitaba katilma izniniz yok.');
        return;
      }
      throw mError;
    }

    rememberNotebookKey(notebook.id, password);
    await refreshNotebookId();
  };

  useEffect(() => {
    if (!user || notebookId !== null || !fetching || loading) return;

    const timer = window.setTimeout(() => setFetching(false), 400);
    return () => window.clearTimeout(timer);
  }, [user, notebookId, fetching, loading]);

  useEffect(() => {
    if (!fetching) return;
    const fallback = window.setTimeout(() => setFetching(false), 12000);
    return () => window.clearTimeout(fallback);
  }, [fetching]);

  // Redirect if user not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  const notebookKey = notebookId ? localStorage.getItem(`notebook_key_${notebookId}`) : null;

  // Fetch notebook entries
  const fetchEntries = useCallback(async () => {
    if (!user || !notebookId) return;
    const notebookIdAtCall = notebookId;
    const fetchSeq = ++fetchSeqRef.current;

    const keys = getNotebookKeyring(notebookIdAtCall);

    if (isDemoMode) {
      const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
      const mockEntries: NotebookEntry[] = JSON.parse(mockEntriesStr);
      // Filter entries belonging to this specific notebook
      const filtered = mockEntries.filter((e) => e.notebook_id === notebookIdAtCall);
      
      const decrypted = await Promise.all(
        filtered.map(async (e) => {
          const dec = await decryptContentWithSecrets(e.content, keys);
          return { ...e, content: dec };
        })
      );

      if (fetchSeq === fetchSeqRef.current) {
        setEntries(decrypted);
        setFetching(false);
      }
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('notebook_entries')
          .select('*')
          .eq('notebook_id', notebookIdAtCall)
          .order('created_at', { ascending: true }),
        DEFAULT_TIMEOUT_MS,
        'FETCH_ENTRIES_TIMEOUT'
      );

      if (error) {
        console.error('Error fetching notebook entries:', error);
      } else {
        const decrypted = await Promise.all(
          (data || []).map(async (e: NotebookEntry) => {
            const dec = await decryptContentWithSecrets(e.content, keys);
            return { ...e, content: dec };
          })
        );
        if (fetchSeq === fetchSeqRef.current && activeNotebookRef.current === notebookIdAtCall) {
          setEntries(decrypted);
        }
      }
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    } finally {
      if (fetchSeq === fetchSeqRef.current && activeNotebookRef.current === notebookIdAtCall) {
        setFetching(false);
      }
    }
  }, [user, notebookId]);

  // Check pairing status (invite code & member count)
  const checkPairingStatus = useCallback(async () => {
    if (!user || !notebookId) return;
    const notebookIdAtCall = notebookId;

    if (isDemoMode) {
      // Load invite code
      const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
      const mockNotebooks: MockNotebook[] = JSON.parse(mockNotebooksStr);
      const activeNotebook = mockNotebooks.find((n) => n.id === notebookIdAtCall);
      setInviteCode(activeNotebook?.invite_code || null);

      // Count members
      const mockMembersStr = localStorage.getItem('mock_notebook_members') || '[]';
      const mockMembers: MockNotebookMember[] = JSON.parse(mockMembersStr);
      const membersCount = mockMembers.filter((m) => m.notebook_id === notebookIdAtCall).length;
      setIsAlone(membersCount < 2);
      return;
    }

    try {
      // Get notebook details
      const { data: notebook, error: nError } = await withTimeout(
        supabase
          .from('notebooks')
          .select('invite_code')
          .eq('id', notebookIdAtCall)
          .single(),
        DEFAULT_TIMEOUT_MS,
        'FETCH_NOTEBOOK_DETAILS_TIMEOUT'
      );

      if (!nError && notebook) {
        setInviteCode(notebook.invite_code);
      }

      // Count members
      const { count, error: cError } = await withTimeout(
        supabase
          .from('notebook_members')
          .select('*', { count: 'exact', head: true })
          .eq('notebook_id', notebookIdAtCall),
        DEFAULT_TIMEOUT_MS,
        'FETCH_MEMBER_COUNT_TIMEOUT'
      );

      if (!cError && count !== null) {
        setIsAlone(count < 2);
      }
    } catch (err) {
      console.error('Error checking pairing status:', err);
    }
  }, [user, notebookId]);

  // Fetch entries and subscribe on mount / notebookId change
  useEffect(() => {
    if (user && notebookId) {
      const notebookIdAtEffect = notebookId;
      const kickoff = window.setTimeout(() => {
        fetchEntries();
        checkPairingStatus();
      }, 0);

      if (isDemoMode) {
        // LocalStorage change listener for syncing sekmeler/tabs
        const handleStorageChange = (e: StorageEvent) => {
          if (activeNotebookRef.current !== notebookIdAtEffect) return;
          if (e.key === 'mock_notebook_entries') {
            fetchEntries();
          } else if (e.key === 'mock_notebook_members' || e.key === 'mock_notebook_members_trigger') {
            checkPairingStatus();
          }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => {
          window.clearTimeout(kickoff);
          window.removeEventListener('storage', handleStorageChange);
        };
      }

      // Realtime subscription for Supabase
      const channel = supabase
        .channel('notebook-details-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notebook_entries',
            filter: `notebook_id=eq.${notebookIdAtEffect}`,
          },
          () => {
            if (activeNotebookRef.current !== notebookIdAtEffect) return;
            fetchEntries();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notebook_members',
            filter: `notebook_id=eq.${notebookIdAtEffect}`,
          },
          () => {
            if (activeNotebookRef.current !== notebookIdAtEffect) return;
            checkPairingStatus();
          }
        )
        .subscribe();

      return () => {
        window.clearTimeout(kickoff);
        supabase.removeChannel(channel);
      };
    }
  }, [user, notebookId, fetchEntries, checkPairingStatus]);

  // Handle notebook creation
  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotebookName.trim() || !user || !createPassword.trim() || leaveLoading) return;

    await runSetupAction('create', async () => {
      const userEmail = user.email?.trim().toLowerCase();
      if (!userEmail) {
        throw new Error('Kullanici e-posta bilgisi okunamadi. Lutfen tekrar giris yapin.');
      }

      const generatedId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      if (isDemoMode) {
        const inviteCode = `demo-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Save notebook details
        const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
        const mockNotebooks: MockNotebook[] = JSON.parse(mockNotebooksStr);
        mockNotebooks.push({
          id: generatedId,
          name: newNotebookName.trim(),
          invite_code: inviteCode
        });
        localStorage.setItem('mock_notebooks', JSON.stringify(mockNotebooks));

        // 2. Save membership details
        const mockMembersStr = localStorage.getItem('mock_notebook_members') || '[]';
        const mockMembers = JSON.parse(mockMembersStr);
        mockMembers.push({
          notebook_id: generatedId,
          user_id: user.id,
          user_email: user.email
        });
        localStorage.setItem('mock_notebook_members', JSON.stringify(mockMembers));

        // Save key locally
        rememberNotebookKey(generatedId, createPassword.trim());

        // 3. Update auth state
        setMockNotebookId(generatedId);
      } else {
        const { data: notebookIdResult, error: rpcError } = await withTimeout(
          supabase.rpc('create_notebook_with_owner', {
            notebook_name: newNotebookName.trim(),
            member_email: userEmail,
          }),
          DEFAULT_TIMEOUT_MS,
          'CREATE_NOTEBOOK_TIMEOUT'
        );

        if (rpcError) {
          if (isRpcMissingError(rpcError)) {
            await createViaFallback(newNotebookName.trim(), userEmail, createPassword.trim());
            return;
          }
          throw rpcError;
        }
        if (!notebookIdResult) throw new Error('CREATE_NOTEBOOK_FAILED');

        // Save key locally
        rememberNotebookKey(String(notebookIdResult), createPassword.trim());

        // 3. Refresh Auth State
        await refreshNotebookId();
      }
    }).catch((err: unknown) => {
      console.error('Failed to create notebook:', err);
      setSetupErrorForCurrent(mapErrorToUserMessage(err, 'create'));
    });
  };

  // Handle notebook joining
  const handleJoinNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim() || !user || !joinPassword.trim() || leaveLoading) return;

    await runSetupAction('join', async () => {
      const code = inviteCodeInput.trim();
      const userEmail = user.email?.trim().toLowerCase();
      if (!userEmail) {
        throw new Error('Kullanici e-posta bilgisi okunamadi. Lutfen tekrar giris yapin.');
      }

      if (isDemoMode) {
        const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
        const mockNotebooks: MockNotebook[] = JSON.parse(mockNotebooksStr);
        const targetNotebook = mockNotebooks.find((n) => n.invite_code.toLowerCase() === code.toLowerCase());

        if (!targetNotebook) {
          setSetupErrorForCurrent('Kod gecersiz. Lutfen davet kodunu kontrol edin.');
          return;
        }

        const mockMembersStr = localStorage.getItem('mock_notebook_members') || '[]';
        const mockMembers: MockNotebookMember[] = JSON.parse(mockMembersStr);
        const isAlreadyMember = mockMembers.some(
          (m) => m.notebook_id === targetNotebook.id && m.user_id === user.id
        );

        if (isAlreadyMember) {
          rememberNotebookKey(targetNotebook.id, joinPassword.trim());
          setMockNotebookId(targetNotebook.id);
          return;
        }

        const existingMembers = mockMembers.filter((m) => m.notebook_id === targetNotebook.id);

        if (existingMembers.length >= 2) {
          setSetupErrorForCurrent('Bu kitap dolu (en fazla 2 kisi).');
          return;
        }

        // Add user as second member
        mockMembers.push({
          notebook_id: targetNotebook.id,
          user_id: user.id,
          user_email: userEmail
        });
        localStorage.setItem('mock_notebook_members', JSON.stringify(mockMembers));

        // Save key locally
        rememberNotebookKey(targetNotebook.id, joinPassword.trim());

        // Save active notebook
        setMockNotebookId(targetNotebook.id);
        
        // Trigger storage event so that both sekmeler update!
        localStorage.setItem('mock_notebook_members_trigger', Date.now().toString());
      } else {
        const { data: joinResult, error: joinError } = await withTimeout(
          supabase.rpc('join_notebook_by_invite', {
            invite_code_input: code,
            member_email: userEmail,
          }),
          DEFAULT_TIMEOUT_MS,
          'JOIN_NOTEBOOK_TIMEOUT'
        );

        if (joinError) {
          if (isRpcMissingError(joinError)) {
            await joinViaFallback(code, userEmail, joinPassword.trim());
            return;
          }
          const raw = (joinError.message || '').toUpperCase();
          if (raw.includes('INVALID_INVITE_CODE')) {
            setSetupErrorForCurrent('Kod gecersiz. Lutfen davet kodunu kontrol edin.');
            return;
          }
          if (raw.includes('NOTEBOOK_FULL')) {
            setSetupErrorForCurrent('Bu kitap dolu (en fazla 2 kisi).');
            return;
          }
          if (joinError.code === '42501' || raw.includes('ROW-LEVEL SECURITY')) {
            setSetupErrorForCurrent('Yetki problemi: Bu kitaba katilma izniniz yok.');
            return;
          }
          throw joinError;
        }

        const row = Array.isArray(joinResult) ? joinResult[0] : joinResult;
        const targetNotebookId = row?.notebook_id;
        if (!targetNotebookId) {
          throw new Error('JOIN_NOTEBOOK_FAILED');
        }

        // Save key locally
        rememberNotebookKey(targetNotebookId, joinPassword.trim());
        await refreshNotebookId();
      }
    }).catch((err: unknown) => {
      console.error('Failed to join notebook:', err);
      setSetupErrorForCurrent(mapErrorToUserMessage(err, 'join'));
    });
  };

  // Handle notebook unlocking
  const handleUnlockNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword.trim() || leaveLoading) return;

    setUnlockLoading(true);
    setUnlockErrorForCurrent('');

    try {
      // Verify password against a raw encrypted entry from storage/db
      let sampleEncryptedContent: string | null = null;

      if (isDemoMode) {
        const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
        const mockEntries: NotebookEntry[] = JSON.parse(mockEntriesStr);
        const target = mockEntries.find(
          (entry) => entry.notebook_id === notebookId && entry.content.startsWith(ENCRYPTION_PREFIX)
        );
        sampleEncryptedContent = target?.content || null;
      } else if (notebookId) {
        const { data, error } = await withTimeout(
          supabase
            .from('notebook_entries')
            .select('content')
            .eq('notebook_id', notebookId)
            .order('created_at', { ascending: false })
            .limit(20),
          DEFAULT_TIMEOUT_MS,
          'UNLOCK_SAMPLE_FETCH_TIMEOUT'
        );

        if (error) throw error;
        const target = (data || []).find((entry) => entry.content?.startsWith(ENCRYPTION_PREFIX));
        sampleEncryptedContent = target?.content || null;
      }

      if (sampleEncryptedContent) {
        const decrypted = await decryptContent(sampleEncryptedContent, unlockPassword.trim());
        if (decrypted === DECRYPTION_FAILED_MARKER) {
          setUnlockErrorForCurrent('Invalid password. Please make sure you entered the shared password correctly.');
          setUnlockLoading(false);
          return;
        }
      }

      // Save key locally
      rememberNotebookKey(notebookId!, unlockPassword.trim());
      // Trigger fetch again to decrypt all entries
      await fetchEntries();
    } catch (err) {
      console.error('Failed to unlock notebook:', err);
      setUnlockErrorForCurrent(mapErrorToUserMessage(err, 'unlock'));
    } finally {
      setUnlockLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveNotebook = async () => {
    if (!user || !notebookId || leaveLoading) return;

    const confirmed = window.confirm(
      'Bu kitaptan ayrilmak istediginize emin misiniz? Sadece uyelikten ayrilirsiniz, icerik silinmez. Demo modda kitapta son uye sizseniz yerel veriler temizlenir.'
    );
    if (!confirmed) return;

    setLeaveLoading(true);
    setLeaveErrorForCurrent('');

    try {
      const currentNotebookId = notebookId;

      if (isDemoMode) {
        leaveCurrentNotebookInDemoMode(currentNotebookId, user.id);
        localStorage.removeItem(`notebook_key_${currentNotebookId}`);
        localStorage.removeItem(`notebook_keyring_${currentNotebookId}`);
        setMockNotebookId(null);
      } else {
        const { error } = await withTimeout(
          supabase
            .from('notebook_members')
            .delete()
            .eq('notebook_id', currentNotebookId)
            .eq('user_id', user.id),
          DEFAULT_TIMEOUT_MS,
          'LEAVE_MEMBERSHIP_TIMEOUT'
        );

        if (error) throw error;

        localStorage.removeItem(`notebook_key_${currentNotebookId}`);
        localStorage.removeItem(`notebook_keyring_${currentNotebookId}`);
        const refreshedId = await refreshNotebookId();
        if (refreshedId === currentNotebookId) {
          setMockNotebookId(null);
        }
      }

      setEntries([]);
      setInviteCode(null);
      setIsAlone(false);
    } catch (err) {
      console.error('Failed to leave notebook:', err);
      setLeaveErrorForCurrent(mapErrorToUserMessage(err, 'leave'));
    } finally {
      setLeaveLoading(false);
    }
  };
  // 1. Loading state
  if (user && notebookId === null && fetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#12100e] text-[#faf5eb]">
        <div className="flex flex-col items-center gap-4">
          <BookOpen className="h-10 w-10 animate-bounce text-[#d9a05b]" />
          <p className="font-serif italic text-lg tracking-wider">Opening sanctuary...</p>
        </div>
      </div>
    );
  }

  // 2. Setup screen (No notebook membership yet)
  if (user && notebookId === null) {
    return (
      <main className="min-h-screen w-full flex flex-col justify-center items-center py-8 relative bg-[#12100e] overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(#1e1814_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
        
        {/* Header bar above setup */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-6 text-[#faf5eb] px-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#d9a05b]" />
            <h2 className="font-serif italic text-xl tracking-wider text-[#d9a05b]">Our Digital Sanctuary</h2>
          </div>
          <button
            onClick={signOut}
            className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-400 text-xs font-bold rounded-full transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        {/* Notebook Leather Cover Setup Container */}
        <div 
          className="w-full max-w-4xl bg-[#2a1b10] rounded-2xl p-5 border-4 border-[#5c3e21] shadow-[0_30px_70px_-10px_rgba(0,0,0,0.8)] relative"
          style={{ perspective: '1500px' }}
        >
          {/* Gold border inset */}
          <div className="absolute inset-2 border border-[#d9a05b]/20 rounded-xl pointer-events-none" />

          {/* Book Inner Page Container */}
          <div className="relative min-h-[500px] rounded-lg overflow-hidden flex flex-col md:flex-row bg-[#1e1c18] shadow-inner">
            
            {/* Spine detail for desktop */}
            <div className="absolute left-1/2 top-0 bottom-0 w-8 -translate-x-1/2 z-30 hidden md:flex flex-col justify-around py-6 pointer-events-none">
              <div className="absolute inset-0 book-spine-shadow" />
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-10 h-3 bg-gradient-to-b from-[#b0b0b0] via-[#dfdfdf] to-[#7f7f7f] rounded-full self-center border border-black/40 shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-40 transform translate-x-[1px]" />
              ))}
            </div>

            {/* Left Page (Information/Invitation) */}
            <div className="w-full md:w-1/2 bg-[#fbf8f3] paper-page p-8 md:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#e8dfd0]">
              <div className="absolute right-0 top-0 bottom-0 w-12 book-fold-left pointer-events-none z-10 hidden md:block" />
              
              <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
              <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

              <div className="my-auto space-y-6 text-center">
                <div className="inline-flex p-3 rounded-full bg-[#8b5a2b]/10 border border-[#8b5a2b]/20">
                  <Heart className="h-8 w-8 text-[#8b5a2b] fill-[#8b5a2b]/10 animate-pulse" />
                </div>
                
                <h3 className="font-serif text-3xl font-bold text-[#5c3e21] tracking-wide">
                  Begin Our Story
                </h3>
                
                <p className="font-body italic text-base leading-relaxed text-[#5c3e21]/80">
                  This scrapbook is built for exactly two people. You can create a brand new digital notebook and invite your partner, or enter their invite code to unlock your shared pages.
                </p>

                <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#8b5a2b]/30 to-transparent mx-auto" />
              </div>
            </div>

            {/* Right Page (Setup actions) */}
            <div className="w-full md:w-1/2 bg-[#fbf8f3] paper-page p-8 md:p-10 flex flex-col justify-between">
              <div className="absolute left-0 top-0 bottom-0 w-12 book-fold-right pointer-events-none z-10 hidden md:block" />

              <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
              <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

              <div className="space-y-8 my-auto">
                {setupError && setupErrorNotebookId === notebookId && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start gap-2 font-serif italic">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{setupError}</span>
                  </div>
                )}

                {/* Option 1: Create Notebook */}
                <form onSubmit={handleCreateNotebook} className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-serif font-bold text-sm text-[#5c3e21] uppercase tracking-wider mb-1">Option A: Create a Notebook</h4>
                    <p className="text-[11px] text-[#8b5a2b]/80 font-serif italic">Create a new book and invite your partner.</p>
                    <input
                      type="text"
                      placeholder="Notebook Name (e.g. Our Story)"
                      value={newNotebookName}
                      onChange={(e) => setNewNotebookName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm italic"
                      disabled={setupLoading || leaveLoading}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Set Sanctuary Password (E2EE)"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      className="w-full px-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm"
                      disabled={setupLoading || leaveLoading}
                      required
                    />
                    <p className="text-[9px] text-[#8b5a2b]/60 italic font-serif leading-none">
                      * This password is used for end-to-end encryption and is never sent to the server.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={setupLoading || leaveLoading || setupLocked}
                    className="w-full py-2 bg-[#5c3e21] hover:bg-[#483019] text-[#faf5eb] font-serif font-bold text-xs rounded transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {setupLoading && setupMode === 'create' ? 'Creating...' : <><Sparkles className="h-3.5 w-3.5" /><span>Create Private Notebook</span></>}
                  </button>
                </form>

                <div className="flex items-center justify-center gap-4 text-[#8b5a2b]/30 font-serif italic text-sm">
                  <div className="h-[1px] flex-1 bg-[#8b5a2b]/15" />
                  <span>or</span>
                  <div className="h-[1px] flex-1 bg-[#8b5a2b]/15" />
                </div>

                {/* Option 2: Join Notebook */}
                <form onSubmit={handleJoinNotebook} className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-serif font-bold text-sm text-[#5c3e21] uppercase tracking-wider mb-1">Option B: Join Existing Book</h4>
                    <p className="text-[11px] text-[#8b5a2b]/80 font-serif italic">Enter the invite code shared by your partner.</p>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b5a2b]/50" />
                      <input
                        type="text"
                        placeholder="Invite Code (e.g. d7a5b3f2)"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm"
                        disabled={setupLoading || leaveLoading}
                        required
                      />
                    </div>
                    <input
                      type="password"
                      placeholder="Enter Sanctuary Password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm"
                      disabled={setupLoading || leaveLoading}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={setupLoading || leaveLoading || setupLocked}
                    className="w-full py-2 bg-[#8b5a2b] hover:bg-[#724a23] text-[#faf5eb] font-serif font-bold text-xs rounded transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {setupLoading && setupMode === 'join' ? 'Joining...' : <><Heart className="h-3.5 w-3.5" /><span>Unlock & Enter Notebook</span></>}
                  </button>
                </form>
              </div>

            </div>

          </div>
        </div>
      </main>
    );
  }

  // 3. Unlock Sanctuary screen (Notebook membership exists, but key is missing in localStorage)
  if (user && notebookId !== null && !notebookKey) {
    return (
      <main className="min-h-screen w-full flex flex-col justify-center items-center py-8 relative bg-[#12100e] overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(#1e1814_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
        
        {/* Header bar above setup */}
        <div className="w-full max-w-md flex justify-between items-center mb-6 text-[#faf5eb] px-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#d9a05b]" />
            <h2 className="font-serif italic text-xl tracking-wider text-[#d9a05b]">Our Digital Sanctuary</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLeaveNotebook}
              disabled={leaveLoading}
              className="px-3 py-1.5 bg-[#5c3e21]/30 hover:bg-[#5c3e21]/50 border border-[#8b5a2b]/40 text-[#f3dcb8] text-xs font-bold rounded-full transition cursor-pointer disabled:opacity-60"
            >
              {leaveLoading ? 'Leaving...' : 'Leave Notebook'}
            </button>
            <button
              onClick={signOut}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-400 text-xs font-bold rounded-full transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Notebook Leather Cover Container */}
        <div 
          className="w-full max-w-md bg-[#2a1b10] rounded-2xl p-5 border-4 border-[#5c3e21] shadow-[0_30px_70px_-10px_rgba(0,0,0,0.8)] relative"
          style={{ perspective: '1500px' }}
        >
          {/* Gold border inset */}
          <div className="absolute inset-2 border border-[#d9a05b]/20 rounded-xl pointer-events-none" />

          {/* Book Inner Page Container */}
          <div className="relative min-h-[400px] rounded-lg overflow-hidden flex flex-col bg-[#fbf8f3] p-8 md:p-10 shadow-inner">
            <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

            <div className="my-auto space-y-6 flex flex-col">
              <div className="text-center">
                <div className="inline-flex p-3 rounded-full bg-[#8b5a2b]/10 border border-[#8b5a2b]/20 mb-4">
                  <Key className="h-8 w-8 text-[#8b5a2b]" />
                </div>
                
                <h3 className="font-serif text-2xl font-bold text-[#5c3e21] tracking-wide">
                  Unlock Sanctuary
                </h3>
                
                <p className="font-body italic text-sm leading-relaxed text-[#5c3e21]/80 mt-2">
                  This notebook is encrypted end-to-end. Please enter your shared Sanctuary Password to unlock the memories.
                </p>
              </div>

              {unlockError && unlockErrorNotebookId === notebookId && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start gap-2 font-serif italic">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{unlockError}</span>
                </div>
              )}

              <form onSubmit={handleUnlockNotebook} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#5c3e21]/70 uppercase tracking-wider block">
                    Sanctuary Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter passphrase"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm"
                    disabled={unlockLoading || leaveLoading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={unlockLoading || leaveLoading}
                  className="w-full py-2 bg-[#5c3e21] hover:bg-[#483019] text-[#faf5eb] font-serif font-bold text-xs rounded transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {unlockLoading ? 'Unlocking...' : <><Sparkles className="h-3.5 w-3.5" /><span>Unlock Sanctuary</span></>}
                </button>
              </form>

              <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#8b5a2b]/30 to-transparent mx-auto" />

              <p className="text-[10px] text-center text-[#8b5a2b]/60 font-serif italic">
                * This password is stored locally in your browser and is never sent to the database.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 4. Main book dashboard
  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center py-8 relative bg-[#12100e] overflow-y-auto">
      {/* Decorative wood grain background */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e1814_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

      {/* Main Notebook */}
      <div className="w-full max-w-6xl z-10 flex flex-col items-center">
        <div className="w-full max-w-2xl mb-4 flex justify-end">
          <button
            onClick={handleLeaveNotebook}
            disabled={leaveLoading}
            className="px-3 py-1.5 bg-[#5c3e21]/90 hover:bg-[#483019] text-[#faf5eb] border border-[#8b5a2b]/60 text-xs font-semibold rounded-md transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{leaveLoading ? 'Leaving notebook...' : 'Leave this notebook'}</span>
          </button>
        </div>

        {leaveError && leaveErrorNotebookId === notebookId && (
          <div className="mb-4 w-full max-w-2xl p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start gap-2 font-serif italic">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{leaveError}</span>
          </div>
        )}
        
        {/* Waiting for partner banner sticky note */}
        {isAlone && inviteCode && (
          <div className="mb-6 w-full max-w-2xl bg-[#faf5eb] border border-[#e5dcd0] text-[#2d2621] p-4 rounded-lg shadow-md relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-3 font-serif">
            {/* Scrapbook pin effect */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#8b2b2b] rounded-full border border-black/20 shadow" />
            
            <div className="flex items-center gap-3">
              <Share2 className="h-5 w-5 text-[#8b5a2b] shrink-0" />
              <div className="text-center sm:text-left">
                <h5 className="font-bold text-sm text-[#5c3e21]">Waiting for your partner to join...</h5>
                <p className="text-xs italic text-[#8b5a2b]/80">Share this unique invite code with them to unlock sharing.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-white/60 border border-[#e5dcd0] px-3 py-1.5 rounded-md font-mono font-bold text-sm tracking-widest text-[#5c3e21]">
              <span>{inviteCode}</span>
              <button
                onClick={copyToClipboard}
                title="Copy Invite Code"
                className="p-1 hover:bg-[#8b5a2b]/10 rounded text-[#8b5a2b] transition cursor-pointer"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Clipboard className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <NotebookBook entries={entries} onRefresh={fetchEntries} notebookId={notebookId!} />
      </div>
    </main>
  );
}

// Simple placeholder icon implementation for alert block
function ShieldAlert(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}


