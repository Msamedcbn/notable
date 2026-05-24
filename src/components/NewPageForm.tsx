'use client';

import React, { useState, useRef } from 'react';
import { supabase, isDemoMode } from '@/lib/supabase';
import { uploadImage } from '@/lib/storage';
import { Image as ImageIcon, X, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { encryptContent } from '@/lib/crypto';

interface NewPageFormProps {
  onSuccess: () => void;
  pageNumber: number;
  notebookId: string;
}

export default function NewPageForm({ onSuccess, pageNumber, notebookId }: NewPageFormProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`));
      }, ms);
      Promise.resolve(promise)
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  };

  const compressImageForUpload = async (file: File): Promise<File> => {
    // Keep already-efficient images as-is unless they are very large.
    if (file.size <= 2 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return file;
    }

    return new Promise<File>((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          const maxDimension = 1920;
          const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * ratio));
          const height = Math.max(1, Math.round(img.height * ratio));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image processing is not available on this device.'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              if (!blob) {
                reject(new Error('Could not optimize image for upload.'));
                return;
              }

              const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
              resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.82
          );
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('This image format is not supported on your browser.'));
      };

      img.src = objectUrl;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setErrorMsg('');
      setLoading(true);

      compressImageForUpload(file)
        .then((preparedFile) => {
          if (preparedFile.size > 5 * 1024 * 1024) {
            throw new Error('Image is still too large after optimization. Please choose another photo.');
          }

          setImageFile(preparedFile);
          if (imagePreview) URL.revokeObjectURL(imagePreview);
          setImagePreview(URL.createObjectURL(preparedFile));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Image could not be processed.';
          setErrorMsg(message);
          if (fileInputRef.current) fileInputRef.current.value = '';
          setImageFile(null);
          if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
            setImagePreview(null);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !imageFile) {
      setErrorMsg('Please write a note or attach a photo.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      let imagePath = '';
      const userEmail = user?.email?.trim().toLowerCase();
      if (!user?.id || !userEmail) {
        throw new Error('Session is invalid. Please sign out and sign in again.');
      }

      if (imageFile) {
        imagePath = await withTimeout(
          uploadImage(imageFile, user.id, notebookId),
          20000,
          'Image upload'
        );
      }

      // Read key from localStorage
      const key = localStorage.getItem(`notebook_key_${notebookId}`) || '';
      if (!key) {
        throw new Error('Şifreleme anahtarı bulunamadı. Lütfen defter kilidini açın.');
      }

      const encryptedText = await encryptContent(content.trim(), key);

      if (isDemoMode) {
        const mockEntriesStr = localStorage.getItem('mock_notebook_entries') || '[]';
        const mockEntries = JSON.parse(mockEntriesStr);
        const newEntry = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          notebook_id: notebookId,
          author_id: user?.id || 'mock-user-1',
          author_email: userEmail,
          content: encryptedText,
          image_url: imagePath || null,
          page_number: mockEntries.length + 1,
          created_at: new Date().toISOString(),
        };
        mockEntries.push(newEntry);
        localStorage.setItem('mock_notebook_entries', JSON.stringify(mockEntries));
      } else {
        // Insert notebook entry
        const insertResult = await withTimeout<{ error: { message?: string } | null }>(
          supabase.from('notebook_entries').insert({
            notebook_id: notebookId,
            author_id: user.id,
            author_email: userEmail,
            content: encryptedText,
            image_url: imagePath || null,
          }),
          20000,
          'Saving message'
        );
        const { error } = insertResult;

        if (error) {
          throw error;
        }
      }

      // Reset form
      setContent('');
      removeImage();
      onSuccess();
    } catch (err: any) {
      console.error('Error adding entry:', err);
      setErrorMsg(err.message || 'Failed to write page. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between p-8 relative">
      {/* Decorative corner lines */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#8b5a2b]/30" />
      <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#8b5a2b]/30" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#8b5a2b]/30" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#8b5a2b]/30" />

      <form onSubmit={handleSubmit} className="flex flex-col h-full justify-between gap-4">
        
        {/* Header */}
        <div className="text-center">
          <span className="text-[10px] font-bold text-[#8b5a2b]/60 uppercase tracking-widest block mb-1">
            New Page Entry
          </span>
          <h3 className="font-serif text-2xl font-semibold text-[#5c3e21] tracking-wide">
            Write a New Memory
          </h3>
          <div className="h-[1px] w-12 bg-[#8b5a2b]/20 mx-auto mt-2" />
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          
          {/* Note Input */}
          <div className="flex-1 relative flex flex-col">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Dear other half, I wanted to tell you..."
              className="w-full flex-1 p-4 bg-white/40 border border-[#e8dfd0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8b5a2b]/50 focus:border-[#8b5a2b]/50 font-body italic text-base leading-relaxed resize-none text-[#2d2621] placeholder-[#8b5a2b]/40 shadow-inner"
              style={{
                backgroundImage: 'linear-gradient(rgba(0,0,0,0.01) 1px, transparent 1px)',
                backgroundSize: '100% 2rem',
              }}
            />
          </div>

          {/* Image Preview & Upload Button */}
          <div className="relative">
            {imagePreview ? (
              <div className="relative rounded-lg overflow-hidden border border-[#e8dfd0] shadow-sm bg-white/40 p-2">
                <img
                  src={imagePreview}
                  alt="Upload preview"
                  className="w-full h-32 object-cover rounded"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-4 right-4 p-1.5 bg-[#5c3e21]/90 hover:bg-[#5c3e21] text-white rounded-full transition shadow cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#e8dfd0] hover:border-[#8b5a2b]/50 rounded-lg p-4 text-center cursor-pointer transition bg-white/20 hover:bg-white/40 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
                <ImageIcon className="h-6 w-6 text-[#8b5a2b]/40 group-hover:text-[#8b5a2b]/70 mx-auto mb-1.5 transition" />
                <span className="text-xs font-serif italic text-[#8b5a2b]/60 group-hover:text-[#8b5a2b] transition">
                  Attach a photo to this page
                </span>
                <span className="block text-[9px] text-[#8b5a2b]/40 mt-0.5">
                  Max size: 5MB
                </span>
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 font-serif italic text-center">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Action Button */}
        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#5c3e21] hover:bg-[#483019] text-[#faf5eb] font-serif font-bold rounded-lg shadow-md transition duration-200 active:translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#faf5eb] border-t-transparent" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Press onto Page</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
