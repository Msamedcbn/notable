'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import NotebookBook from '@/components/NotebookBook';
import { BookOpen } from 'lucide-react';

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
  const { user, isAllowed, loading } = useAuth();
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const router = useRouter();

  // Redirect to login if not authenticated or not allowed
  useEffect(() => {
    if (!loading) {
      if (!user || !isAllowed) {
        router.push('/login');
      }
    }
  }, [user, isAllowed, loading, router]);

  // Fetch notebook entries
  const fetchEntries = useCallback(async () => {
    if (!user || !isAllowed) return;

    if (isDemoMode) {
      const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
      setEntries(JSON.parse(mockEntriesStr));
      setFetching(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notebook_entries')
        .select('*')
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
  }, [user, isAllowed]);

  useEffect(() => {
    if (user && isAllowed) {
      fetchEntries();

      if (isDemoMode) {
        const handleStorageChange = (e: StorageEvent) => {
          if (e.key === 'mock_notebook_entries') {
            fetchEntries();
          }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
      }

      // Subscribe to real-time updates on notebook_entries table
      const channel = supabase
        .channel('notebook-realtime')
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
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isAllowed, fetchEntries]);

  if (loading || (user && isAllowed && fetching)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#12100e] text-[#faf5eb]">
        <div className="flex flex-col items-center gap-4">
          <BookOpen className="h-10 w-10 animate-bounce text-[#d9a05b]" />
          <p className="font-serif italic text-lg tracking-wider">Loading the pages...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAllowed) {
    return null; // Redirecting via useEffect
  }

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center py-8 relative bg-[#12100e] overflow-y-auto">
      {/* Decorative desktop wooden background textures */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e1814_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

      {/* Main Notebook */}
      <div className="w-full max-w-6xl z-10">
        <NotebookBook entries={entries} onRefresh={fetchEntries} />
      </div>
    </main>
  );
}
