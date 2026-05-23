'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import NotebookBook from '@/components/NotebookBook';
import { BookOpen, Sparkles, Heart, Key, Share2, Clipboard, Check } from 'lucide-react';

interface NotebookEntry {
  id: string;
  author_id: string;
  author_email: string;
  content: string;
  image_url: string | null;
  page_number: number;
  created_at: string;
}

export default function HomePage() {
  const { user, notebookId, refreshNotebookId, signOut, setMockNotebookId } = useAuth();
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  
  // Setup inputs
  const [newNotebookName, setNewNotebookName] = useState('Our Story');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  
  // Pairing status details
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isAlone, setIsAlone] = useState(false);
  const [copied, setCopied] = useState(false);

  const router = useRouter();

  // Redirect if user not logged in
  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  // Fetch notebook entries
  const fetchEntries = useCallback(async () => {
    if (!user || !notebookId) return;

    if (isDemoMode) {
      const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
      const mockEntries = JSON.parse(mockEntriesStr);
      // Filter entries belonging to this specific notebook
      const filtered = mockEntries.filter((e: any) => e.notebook_id === notebookId);
      setEntries(filtered);
      setFetching(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notebook_entries')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching notebook entries:', error);
      } else {
        setEntries(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    } finally {
      setFetching(false);
    }
  }, [user, notebookId]);

  // Check pairing status (invite code & member count)
  const checkPairingStatus = useCallback(async () => {
    if (!user || !notebookId) return;

    if (isDemoMode) {
      // Load invite code
      const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
      const mockNotebooks = JSON.parse(mockNotebooksStr);
      const activeNotebook = mockNotebooks.find((n: any) => n.id === notebookId);
      setInviteCode(activeNotebook?.invite_code || null);

      // Count members
      const mockMembersStr = localStorage.getItem('mock_notebook_members') || '[]';
      const mockMembers = JSON.parse(mockMembersStr);
      const membersCount = mockMembers.filter((m: any) => m.notebook_id === notebookId).length;
      setIsAlone(membersCount < 2);
      return;
    }

    try {
      // Get notebook details
      const { data: notebook, error: nError } = await supabase
        .from('notebooks')
        .select('invite_code')
        .eq('id', notebookId)
        .single();

      if (!nError && notebook) {
        setInviteCode(notebook.invite_code);
      }

      // Count members
      const { count, error: cError } = await supabase
        .from('notebook_members')
        .select('*', { count: 'exact', head: true })
        .eq('notebook_id', notebookId);

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
      fetchEntries();
      checkPairingStatus();

      if (isDemoMode) {
        // LocalStorage change listener for syncing sekmeler/tabs
        const handleStorageChange = (e: StorageEvent) => {
          if (e.key === 'mock_notebook_entries') {
            fetchEntries();
          } else if (e.key === 'mock_notebook_members') {
            checkPairingStatus();
          }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
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
          },
          () => {
            fetchEntries();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notebook_members',
          },
          () => {
            checkPairingStatus();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, notebookId, fetchEntries, checkPairingStatus]);

  // Handle notebook creation
  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotebookName.trim() || !user) return;

    setSetupLoading(true);
    setSetupError('');

    try {
      const generatedId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      if (isDemoMode) {
        const inviteCode = `demo-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Save notebook details
        const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
        const mockNotebooks = JSON.parse(mockNotebooksStr);
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

        // 3. Update auth state
        setMockNotebookId(generatedId);
      } else {
        // Supabase Mode
        // 1. Create notebook
        const { data: notebook, error: nError } = await supabase
          .from('notebooks')
          .insert({ name: newNotebookName.trim() })
          .select()
          .single();

        if (nError) throw nError;

        // 2. Create membership
        const { error: mError } = await supabase
          .from('notebook_members')
          .insert({
            notebook_id: notebook.id,
            user_id: user.id,
            user_email: user.email
          });

        if (mError) throw mError;

        // 3. Refresh Auth State
        await refreshNotebookId();
      }
    } catch (err: any) {
      console.error('Failed to create notebook:', err);
      setSetupError(err.message || 'Could not create notebook. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  // Handle notebook joining
  const handleJoinNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim() || !user) return;

    setSetupLoading(true);
    setSetupError('');

    try {
      const code = inviteCodeInput.trim();

      if (isDemoMode) {
        const mockNotebooksStr = localStorage.getItem('mock_notebooks') || '[]';
        const mockNotebooks = JSON.parse(mockNotebooksStr);
        const targetNotebook = mockNotebooks.find((n: any) => n.invite_code.toLowerCase() === code.toLowerCase());

        if (!targetNotebook) {
          setSetupError('Invalid invite code. Try using user1 or user2 invite codes if already generated.');
          setSetupLoading(false);
          return;
        }

        const mockMembersStr = localStorage.getItem('mock_notebook_members') || '[]';
        const mockMembers = JSON.parse(mockMembersStr);
        const existingMembers = mockMembers.filter((m: any) => m.notebook_id === targetNotebook.id);

        if (existingMembers.length >= 2) {
          setSetupError('This notebook is already full (maximum 2 partners).');
          setSetupLoading(false);
          return;
        }

        // Add user as second member
        mockMembers.push({
          notebook_id: targetNotebook.id,
          user_id: user.id,
          user_email: user.email
        });
        localStorage.setItem('mock_notebook_members', JSON.stringify(mockMembers));

        // Save active notebook
        setMockNotebookId(targetNotebook.id);
        
        // Trigger storage event so that both sekmeler update!
        localStorage.setItem('mock_notebook_members_trigger', Date.now().toString());
      } else {
        // Supabase Mode
        // 1. Fetch notebook by invite code
        const { data: notebook, error: nError } = await supabase
          .from('notebooks')
          .select('*')
          .eq('invite_code', code)
          .maybeSingle();

        if (nError) throw nError;
        
        if (!notebook) {
          setSetupError('Invalid invite code. Please check and try again.');
          setSetupLoading(false);
          return;
        }

        // 2. Join notebook (membership policies prevent joining if already full)
        const { error: mError } = await supabase
          .from('notebook_members')
          .insert({
            notebook_id: notebook.id,
            user_id: user.id,
            user_email: user.email
          });

        if (mError) {
          if (mError.code === '42501' || mError.message.includes('row-level security')) {
            setSetupError('This notebook is already full or you cannot join.');
          } else {
            throw mError;
          }
        } else {
          // 3. Refresh Auth state
          await refreshNotebookId();
        }
      }
    } catch (err: any) {
      console.error('Failed to join notebook:', err);
      setSetupError(err.message || 'Could not join notebook. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Loading state
  if (user && notebookId === null && fetching) {
    // If notebookId is not fetched yet, wait a second
    setTimeout(() => setFetching(false), 400);
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
                {setupError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start gap-2 font-serif italic">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{setupError}</span>
                  </div>
                )}

                {/* Option 1: Create Notebook */}
                <form onSubmit={handleCreateNotebook} className="space-y-3">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#5c3e21] uppercase tracking-wider mb-1">Option A: Create a Notebook</h4>
                    <p className="text-[11px] text-[#8b5a2b]/80 font-serif italic mb-2">Create a new book and invite your partner.</p>
                    <input
                      type="text"
                      placeholder="Notebook Name (e.g. Our Story)"
                      value={newNotebookName}
                      onChange={(e) => setNewNotebookName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm italic"
                      disabled={setupLoading}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={setupLoading}
                    className="w-full py-2 bg-[#5c3e21] hover:bg-[#483019] text-[#faf5eb] font-serif font-bold text-xs rounded transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {setupLoading ? 'Creating...' : <><Sparkles className="h-3.5 w-3.5" /><span>Create Private Notebook</span></>}
                  </button>
                </form>

                <div className="flex items-center justify-center gap-4 text-[#8b5a2b]/30 font-serif italic text-sm">
                  <div className="h-[1px] flex-1 bg-[#8b5a2b]/15" />
                  <span>or</span>
                  <div className="h-[1px] flex-1 bg-[#8b5a2b]/15" />
                </div>

                {/* Option 2: Join Notebook */}
                <form onSubmit={handleJoinNotebook} className="space-y-3">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#5c3e21] uppercase tracking-wider mb-1">Option B: Join Existing Book</h4>
                    <p className="text-[11px] text-[#8b5a2b]/80 font-serif italic mb-2">Enter the invite code shared by your partner.</p>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b5a2b]/50" />
                      <input
                        type="text"
                        placeholder="Invite Code (e.g. d7a5b3f2)"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-body text-sm"
                        disabled={setupLoading}
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={setupLoading}
                    className="w-full py-2 bg-[#8b5a2b] hover:bg-[#724a23] text-[#faf5eb] font-serif font-bold text-xs rounded transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {setupLoading ? 'Joining...' : <><Heart className="h-3.5 w-3.5" /><span>Unlock & Enter Notebook</span></>}
                  </button>
                </form>
              </div>

            </div>

          </div>
        </div>
      </main>
    );
  }

  // 3. Main book dashboard
  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center py-8 relative bg-[#12100e] overflow-y-auto">
      {/* Decorative wood grain background */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e1814_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

      {/* Main Notebook */}
      <div className="w-full max-w-6xl z-10 flex flex-col items-center">
        
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
