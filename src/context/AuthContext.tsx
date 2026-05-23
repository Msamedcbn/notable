'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isDemoMode } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAllowed: boolean;
  checkAllowedUser: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  signInMockUser: (email: string, displayName: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAllowed, setIsAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  const checkAllowedUser = async (email: string): Promise<boolean> => {
    if (isDemoMode) {
      const allowedEmails = [
        'user1@example.com',
        'user2@example.com',
        'demo@example.com',
        'partner@example.com',
      ];
      return allowedEmails.includes(email.trim().toLowerCase());
    }

    try {
      const { data, error } = await supabase
        .from('allowed_emails')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error('Error verifying allowed user:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Exception verifying user:', err);
      return false;
    }
  };

  const signInMockUser = (email: string, displayName: string) => {
    const mockUser: User = {
      id: email === 'user1@example.com' ? 'mock-user-1' : 'mock-user-2',
      app_metadata: {},
      user_metadata: { display_name: displayName },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: email.trim().toLowerCase(),
    };
    localStorage.setItem('mock_user', JSON.stringify(mockUser));
    setUser(mockUser);
    setIsAllowed(true);
  };

  useEffect(() => {
    if (isDemoMode) {
      setLoading(true);
      const savedUser = localStorage.getItem('mock_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        setIsAllowed(true);
      } else {
        setUser(null);
        setIsAllowed(false);
      }
      setLoading(false);
      return;
    }

    // Check active session on mount (Supabase mode)
    const checkSession = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          const allowed = await checkAllowedUser(session.user.email || '');
          setIsAllowed(allowed);
          if (!allowed) {
            await supabase.auth.signOut();
            setUser(null);
          }
        } else {
          setUser(null);
          setIsAllowed(false);
        }
      } catch (error) {
        console.error('Session check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes (Supabase mode)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);
        if (session?.user) {
          setUser(session.user);
          const allowed = await checkAllowedUser(session.user.email || '');
          setIsAllowed(allowed);
          if (!allowed) {
            await supabase.auth.signOut();
            setUser(null);
          }
        } else {
          setUser(null);
          setIsAllowed(false);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    if (isDemoMode) {
      localStorage.removeItem('mock_user');
    } else {
      await supabase.auth.signOut();
    }
    setUser(null);
    setIsAllowed(false);
    setLoading(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isAllowed, checkAllowedUser, signOut, signInMockUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
