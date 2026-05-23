'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isDemoMode } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  notebookId: string | null;
  refreshNotebookId: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signInMockUser: (email: string, displayName: string) => void;
  setMockNotebookId: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  // Fetch active notebook membership
  const refreshNotebookId = useCallback(async (currentUser: User | null = user): Promise<string | null> => {
    if (!currentUser) {
      setNotebookId(null);
      return null;
    }

    if (isDemoMode) {
      const mockNotebookId = localStorage.getItem(`mock_notebook_id_${currentUser.id}`);
      setNotebookId(mockNotebookId);
      return mockNotebookId;
    }

    try {
      const { data, error } = await supabase
        .from('notebook_members')
        .select('notebook_id')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching notebook membership:', error);
        setNotebookId(null);
        return null;
      }

      const activeNotebookId = data?.notebook_id || null;
      setNotebookId(activeNotebookId);
      return activeNotebookId;
    } catch (err) {
      console.error('Exception fetching membership:', err);
      setNotebookId(null);
      return null;
    }
  }, [user]);

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
    
    // Load their mock notebook ID immediately
    const mockNotebookId = localStorage.getItem(`mock_notebook_id_${mockUser.id}`) || null;
    setNotebookId(mockNotebookId);
  };

  const setMockNotebookId = (id: string | null) => {
    if (user) {
      if (id) {
        localStorage.setItem(`mock_notebook_id_${user.id}`, id);
      } else {
        localStorage.removeItem(`mock_notebook_id_${user.id}`);
      }
      setNotebookId(id);
    }
  };

  useEffect(() => {
    if (isDemoMode) {
      setLoading(true);
      const savedUser = localStorage.getItem('mock_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        const mockNotebookId = localStorage.getItem(`mock_notebook_id_${parsedUser.id}`);
        setNotebookId(mockNotebookId);
      } else {
        setUser(null);
        setNotebookId(null);
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
          await refreshNotebookId(session.user);
        } else {
          setUser(null);
          setNotebookId(null);
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
          await refreshNotebookId(session.user);
        } else {
          setUser(null);
          setNotebookId(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshNotebookId]);

  const signOut = async () => {
    setLoading(true);
    if (isDemoMode) {
      localStorage.removeItem('mock_user');
    } else {
      await supabase.auth.signOut();
    }
    setUser(null);
    setNotebookId(null);
    setLoading(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notebookId,
        refreshNotebookId,
        signOut,
        signInMockUser,
        setMockNotebookId,
      }}
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
