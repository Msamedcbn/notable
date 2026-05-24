'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, BookOpen, User, ShieldAlert, Sparkles, Heart } from 'lucide-react';

export default function LoginPage() {
  const { user, loading, signInMockUser } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();

  // Redirect to home if logged in
  useEffect(() => {
    if (user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setActionLoading(true);

    if (!email || !password) {
      setErrorMsg('Please fill in all fields.');
      setActionLoading(false);
      return;
    }

    try {
      if (isDemoMode) {
        // Offline Demo Mode Logic
        const displayName = isSignUp
          ? (name.trim() || 'Partner')
          : (email.trim().toLowerCase().startsWith('user1') ? 'Romeo' : 'Juliet');

        signInMockUser(email, displayName);
        router.push('/');
        return;
      }

      // Supabase Active Database Mode Logic
      if (isSignUp) {
        if (!name) {
          setErrorMsg('Please provide a name/nickname.');
          setActionLoading(false);
          return;
        }

        // Proceed with Supabase Auth SignUp
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              display_name: name.trim(),
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
        } else {
          setInfoMsg('Account created successfully! Please log in.');
          setIsSignUp(false);
        }
      } else {
        // Log In
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          setErrorMsg(error.message);
        } else {
          router.push('/');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMsg(message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#12100e] text-[#fbf8f3]">
        <div className="flex flex-col items-center gap-4">
          <BookOpen className="h-10 w-10 animate-bounce text-[#d9a05b]" />
          <p className="font-serif italic text-lg tracking-wider">Unlocking the notebook...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 bg-[#12100e] overflow-hidden">
      {/* Background Decorative Desk Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(#201c18_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
      
      {/* Light glow from the center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#d9a05b] rounded-full blur-[160px] opacity-10 pointer-events-none" />

      {/* Book Cover Frame */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border-4 border-[#5c3e21] bg-[#2a1b10] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]"
        style={{
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.8), inset 0 0 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
        }}
      >
        {/* Leather texture simulation overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:8px_8px] opacity-50 pointer-events-none" />
        
        {/* Gold Trim Borders */}
        <div className="absolute inset-3 border border-[#d9a05b]/30 rounded-xl pointer-events-none" />
        <div className="absolute inset-4 border border-[#d9a05b]/10 rounded-lg pointer-events-none" />

        {/* Notebook Spine Bind Detail on the left (simulated leather binding) */}
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#170e08] via-[#22140c] to-[#120a06] border-r border-[#d9a05b]/20 shadow-[inset_-3px_0_10px_rgba(0,0,0,0.8)]" />

        {/* Main Content inside the cover */}
        <div className="pl-12 pr-8 py-10 flex flex-col items-center">
          
          {/* Embossed Book Label */}
          <div className="w-full text-center mb-8 relative">
            <div className="inline-flex p-3 rounded-full bg-[#3d2717] border border-[#d9a05b]/40 shadow-inner mb-4">
              <Heart className="h-6 w-6 text-[#d9a05b] fill-[#d9a05b]/20" />
            </div>
            
            {isDemoMode && (
              <span className="absolute top-0 right-0 px-2 py-0.5 bg-[#d9a05b] text-[#2a1b10] text-[9px] font-bold tracking-wider rounded uppercase shadow">
                Demo Mode
              </span>
            )}

            <h1 className="font-serif text-3xl font-bold text-[#faf5eb] tracking-wide mb-1">
              Our Digital Notebook
            </h1>
            <p className="text-[#d9a05b]/80 font-serif italic text-sm">
              A private shared scrapbook for two
            </p>
            <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#d9a05b]/40 to-transparent mx-auto mt-3" />
          </div>

          {/* Form Card (Parchment Paper Label) */}
          <div className="w-full bg-[#fbf8f3] text-[#2c2a29] rounded-lg p-6 shadow-inner relative border border-[#e5dcd0]">
            {/* Corner details on the parchment label */}
            <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[#8b5a2b]/30" />
            <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[#8b5a2b]/30" />
            <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[#8b5a2b]/30" />
            <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[#8b5a2b]/30" />

            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-center font-serif font-bold text-lg text-[#5c3e21] tracking-wide mb-4 uppercase">
                {isSignUp ? 'First Page Entry' : 'Open Notebook'}
              </h2>

              <AnimatePresence mode="wait">
                {errorMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-start gap-2"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}

                {infoMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-xs flex items-start gap-2"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                    <span>{infoMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {isSignUp && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#5c3e21]/70 uppercase tracking-wider block">Your Nickname</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b5a2b]/60" />
                    <input
                      type="text"
                      placeholder="e.g. Juliet"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-serif text-sm"
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#5c3e21]/70 uppercase tracking-wider block">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b5a2b]/60" />
                  <input
                    type="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-serif text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#5c3e21]/70 uppercase tracking-wider block">Secret Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b5a2b]/60" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white/60 border border-[#e5dcd0] rounded focus:outline-none focus:ring-1 focus:ring-[#8b5a2b] font-serif text-sm"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full mt-4 py-2.5 bg-[#5c3e21] hover:bg-[#483019] text-[#faf5eb] font-serif font-bold rounded shadow transition duration-200 active:translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#faf5eb] border-t-transparent" />
                ) : (
                  <>
                    <BookOpen className="h-4 w-4" />
                    <span>{isSignUp ? 'Register & Open Cover' : 'Open Notebook'}</span>
                  </>
                )}
              </button>
            </form>

            {/* Form Toggle Link */}
            <div className="mt-4 pt-3 border-t border-[#e5dcd0]/50 text-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMsg('');
                  setInfoMsg('');
                }}
                className="text-[#8b5a2b] hover:text-[#5c3e21] font-serif italic underline cursor-pointer"
              >
                {isSignUp ? 'Already registered? Open the book' : 'First time? Sign up here'}
              </button>
            </div>

            {/* Quick Demo Login Presets */}
            {isDemoMode && (
              <div className="mt-4 pt-3 border-t border-[#e5dcd0]/50 text-center">
                <p className="text-[10px] font-bold text-[#8b5a2b]/70 uppercase tracking-wider mb-2">
                  Demo Accounts (Preset)
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('user1@example.com');
                      setPassword('demo-mode-bypass');
                    }}
                    className="px-2.5 py-1 bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 border border-[#8b5a2b]/20 text-[#8b5a2b] font-serif text-xs rounded transition cursor-pointer"
                  >
                    Romeo (user1)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('user2@example.com');
                      setPassword('demo-mode-bypass');
                    }}
                    className="px-2.5 py-1 bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 border border-[#8b5a2b]/20 text-[#8b5a2b] font-serif text-xs rounded transition cursor-pointer"
                  >
                    Juliet (user2)
                  </button>
                </div>
              </div>
            )}

          </div>

          <div className="mt-8 flex items-center gap-1.5 text-xs text-[#d9a05b]/50">
            <span className="font-serif italic">
              {isDemoMode 
                ? 'Running in Offline Demo Mode. Try clicking one of the preset accounts above!'
                : 'Enter your credentials to unlock your shared scrapbook.'}
            </span>
          </div>

        </div>
      </motion.div>
    </main>
  );
}
