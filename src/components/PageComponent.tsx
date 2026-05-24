'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { getSignedImageUrl } from '@/lib/storage';
import { Trash2, Heart, Calendar, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import { NotebookEntry } from '@/lib/types';
import { DECRYPTION_FAILED_MARKER, LOCKED_CONTENT_MARKER } from '@/lib/crypto';

interface PageComponentProps {
  type: 'welcome' | 'entry' | 'form' | 'back-cover';
  entry?: NotebookEntry;
  onDelete?: () => void;
  formComponent?: React.ReactNode;
  pageNumber: number;
}

export default function PageComponent({
  type,
  entry,
  onDelete,
  formComponent,
  pageNumber,
}: PageComponentProps) {
  const { user } = useAuth();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (type === 'entry' && entry?.image_url) {
      let isMounted = true;
      getSignedImageUrl(entry.image_url).then((url) => {
        if (isMounted) setSignedUrl(url);
      });
      return () => {
        isMounted = false;
      };
    } else {
      window.setTimeout(() => setSignedUrl(null), 0);
    }
  }, [type, entry?.image_url]);

  const handleTearOut = async () => {
    if (!entry || deleting) return;
    if (!confirm('Are you sure you want to tear this page out of the notebook forever?')) return;

    setDeleting(true);
    try {
      if (isDemoMode) {
        const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
        let mockEntries: NotebookEntry[] = JSON.parse(mockEntriesStr);
        mockEntries = mockEntries.filter((e) => e.id !== entry.id);
        localStorage.setItem('mock_notebook_entries', JSON.stringify(mockEntries));
        if (onDelete) onDelete();
        return;
      }

      // 1. Delete image from storage first if exists
      if (entry.image_url) {
        await supabase.storage.from('notebook-images').remove([entry.image_url]);
      }

      // 2. Delete entry from database
      const { error } = await supabase
        .from('notebook_entries')
        .delete()
        .eq('id', entry.id);

      if (error) throw error;
      if (onDelete) onDelete();
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('Could not tear out the page. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getAuthorDisplay = (email: string) => {
    return email.split('@')[0];
  };

  const getDisplayContent = (content: string) => {
    if (content === DECRYPTION_FAILED_MARKER || content === LOCKED_CONTENT_MARKER) {
      const currentEmail = user?.email?.trim().toLowerCase() || '';
      if (LEGACY_HIDE_ENCRYPTION_NOTICE_USERS.has(currentEmail)) {
        return '';
      }
      return 'This page is encrypted. Enter the correct Sanctuary Password to read it.';
    }
    return content;
  };

  if (type === 'welcome') {
    return (
      <div className="flex flex-col h-full justify-between p-12 relative text-center">
        {/* Borders */}
        <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
        <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

        <div className="my-auto space-y-6 flex flex-col items-center">
          <div className="inline-flex p-3 rounded-full bg-[#8b5a2b]/10 border border-[#8b5a2b]/20">
            <Heart className="h-8 w-8 text-[#8b5a2b] fill-[#8b5a2b]/10 animate-pulse" />
          </div>
          
          <h2 className="font-serif text-3xl font-bold text-[#5c3e21] tracking-wide">
            Our Story Begins
          </h2>
          
          <p className="font-serif italic text-base leading-relaxed text-[#5c3e21]/80 max-w-sm">
            &ldquo;This is a quiet corner for us. A place to store our laughs, our photos, and the thoughts we share throughout our days.&rdquo;
          </p>

          <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#8b5a2b]/30 to-transparent" />

          <p className="text-xs tracking-wider text-[#8b5a2b]/60 uppercase font-bold">
            Write on the right page to start our journal.
          </p>
        </div>

        <div className="text-[10px] font-serif text-[#8b5a2b]/40">
          Page {pageNumber}
        </div>
      </div>
    );
  }

  if (type === 'back-cover') {
    return (
      <div className="flex flex-col h-full justify-between p-12 relative text-center bg-[#faf5eb]">
        <div className="absolute inset-0 bg-[#fbf8f3] opacity-40 pointer-events-none" />
        
        {/* Borders */}
        <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/20" />
        <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/20" />
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/20" />
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/20" />

        <div className="my-auto space-y-4">
          <Sparkles className="h-6 w-6 text-[#8b5a2b]/40 mx-auto" />
          <p className="font-serif italic text-sm text-[#8b5a2b]/50">
            More pages to write, more memories to hold.
          </p>
        </div>

        <div className="text-[10px] font-serif text-[#8b5a2b]/40">
          Page {pageNumber}
        </div>
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="h-full">
        {formComponent}
      </div>
    );
  }

  // Type === 'entry'
  if (!entry) return null;

  const isAuthor = user?.id === entry.author_id;

  return (
    <div className="flex flex-col h-full justify-between p-8 relative">
      {/* Decorative corners */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
      <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

      {/* Page Header (Author, Timestamp, Tear Out) */}
      <div className="flex justify-between items-start border-b border-[#e8dfd0] pb-3 mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[#5c3e21]">
            <User className="h-3.5 w-3.5 text-[#8b5a2b]" />
            <span className="font-serif font-bold text-sm tracking-wide capitalize">
              {getAuthorDisplay(entry.author_email)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#8b5a2b]/70">
            <Calendar className="h-3 w-3" />
            <span className="font-serif italic">
              {formatDate(entry.created_at)}
            </span>
          </div>
        </div>

        {isAuthor && (
          <button
            onClick={handleTearOut}
            disabled={deleting}
            title="Tear page out of book"
            className="p-1.5 text-[#8b5a2b]/50 hover:text-red-700 hover:bg-red-50 rounded-full transition cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Page Body (Content & Photo) */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 pb-4 min-h-0">
        {signedUrl && (
          <div className="w-full relative rounded-lg overflow-hidden border border-[#e8dfd0] shadow-sm bg-white/50 p-2 shrink-0">
            <div className="relative w-full h-56">
              <Image
                src={signedUrl}
                alt="Memory upload"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover rounded"
              />
            </div>
            {/* Scrapbook photo mounting corner effect */}
            <div className="absolute top-2 left-2 w-3 h-3 bg-[#e8dfd0] -rotate-45 shadow-sm" />
            <div className="absolute top-2 right-2 w-3 h-3 bg-[#e8dfd0] rotate-45 shadow-sm" />
            <div className="absolute bottom-2 left-2 w-3 h-3 bg-[#e8dfd0] rotate-45 shadow-sm" />
            <div className="absolute bottom-2 right-2 w-3 h-3 bg-[#e8dfd0] -rotate-45 shadow-sm" />
          </div>
        )}

        <div className="flex-1">
          <p className="font-body text-[#2d2621] text-base leading-relaxed whitespace-pre-wrap italic">
            {getDisplayContent(entry.content)}
          </p>
        </div>
      </div>

      {/* Page Footer (Page Number) */}
      <div className="text-center text-[10px] font-serif text-[#8b5a2b]/40 border-t border-[#e8dfd0]/40 pt-2 shrink-0">
        Page {pageNumber}
      </div>
    </div>
  );
}
  const LEGACY_HIDE_ENCRYPTION_NOTICE_USERS = new Set([
    'kilifdeneyebilirmiyimm@notable.com',
    'kayitalabilirmiyimmm@notable.com',
  ]);
