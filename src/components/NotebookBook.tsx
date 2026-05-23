'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, LogOut } from 'lucide-react';
import PageComponent from './PageComponent';
import NewPageForm from './NewPageForm';
import { useAuth } from '@/context/AuthContext';

interface NotebookEntry {
  id: string;
  author_id: string;
  author_email: string;
  content: string;
  image_url: string | null;
  page_number: number;
  created_at: string;
}

interface NotebookBookProps {
  entries: NotebookEntry[];
  onRefresh: () => void;
}

export default function NotebookBook({ entries, onRefresh }: NotebookBookProps) {
  const { user, signOut } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // For mobile
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0); // For desktop
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  // Detect screen size
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Build the page array
  const pages: any[] = [];
  if (entries.length === 0) {
    pages.push({ type: 'welcome', pageNumber: 1 });
    pages.push({ type: 'form', pageNumber: 2 });
  } else {
    entries.forEach((entry, idx) => {
      pages.push({ type: 'entry', entry, pageNumber: idx + 1 });
    });
    pages.push({ type: 'form', pageNumber: entries.length + 1 });
    if (pages.length % 2 !== 0) {
      pages.push({ type: 'back-cover', pageNumber: entries.length + 2 });
    }
  }

  const totalSpreads = Math.ceil(pages.length / 2);

  // Jump to the end (new page form) when an entry is successfully added
  const handleSuccess = () => {
    onRefresh();
    // After refetching, wait a moment and then navigate to the last spread/page
    setTimeout(() => {
      if (isMobile) {
        setCurrentPageIndex(pages.length - 1);
      } else {
        setCurrentSpreadIndex(totalSpreads - 1);
      }
    }, 300);
  };

  const handleNext = () => {
    setDirection('next');
    if (isMobile) {
      if (currentPageIndex < pages.length - 1) {
        setCurrentPageIndex(currentPageIndex + 1);
      }
    } else {
      if (currentSpreadIndex < totalSpreads - 1) {
        setCurrentSpreadIndex(currentSpreadIndex + 1);
      }
    }
  };

  const handlePrev = () => {
    setDirection('prev');
    if (isMobile) {
      if (currentPageIndex > 0) {
        setCurrentPageIndex(currentPageIndex - 1);
      }
    } else {
      if (currentSpreadIndex > 0) {
        setCurrentSpreadIndex(currentSpreadIndex - 1);
      }
    }
  };

  // Keep navigation in bounds on window resizing / entries length changes
  useEffect(() => {
    if (isMobile) {
      // sync spread index to page index
      const targetPage = currentSpreadIndex * 2;
      setCurrentPageIndex(Math.min(targetPage, pages.length - 1));
    } else {
      // sync page index to spread index
      const targetSpread = Math.floor(currentPageIndex / 2);
      setCurrentSpreadIndex(Math.min(targetSpread, totalSpreads - 1));
    }
  }, [isMobile]);

  // Framer Motion Animation Variants for page transitions
  const pageVariants: any = {
    initial: (dir: 'next' | 'prev') => ({
      rotateY: dir === 'next' ? 45 : -45,
      opacity: 0,
      transformOrigin: 'left center',
      scale: 0.98,
    }),
    animate: {
      rotateY: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: 'easeOut',
      },
    },
    exit: (dir: 'next' | 'prev') => ({
      rotateY: dir === 'next' ? -45 : 45,
      opacity: 0,
      scale: 0.98,
      transformOrigin: 'right center',
      transition: {
        duration: 0.4,
        ease: 'easeIn',
      },
    }),
  };

  // Helper render to avoid duplicates
  const renderPage = (pageItem: any) => {
    if (!pageItem) return null;
    return (
      <PageComponent
        type={pageItem.type}
        entry={pageItem.entry}
        pageNumber={pageItem.pageNumber}
        onDelete={onRefresh}
        formComponent={
          <NewPageForm
            onSuccess={handleSuccess}
            pageNumber={pageItem.pageNumber}
          />
        }
      />
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col items-center justify-center py-6 px-4">
      {/* Header bar above the notebook */}
      <div className="w-full flex justify-between items-center mb-6 text-[#faf5eb] px-2 md:px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-[#d9a05b]" />
          <h2 className="font-serif italic text-lg md:text-xl tracking-wider text-[#d9a05b]">
            Our Digital Sanctuary
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-serif italic opacity-80 hidden sm:inline-block">
            Signed in as {user?.email}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d9a05b]/10 hover:bg-[#d9a05b]/20 border border-[#d9a05b]/20 text-[#d9a05b] text-xs font-bold rounded-full transition cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Close Book</span>
          </button>
        </div>
      </div>

      {/* Book Outer Wrapper */}
      <div className="relative w-full flex items-center justify-center select-none">
        
        {/* Navigation Buttons (Desktop) */}
        {!isMobile && (
          <>
            <button
              onClick={handlePrev}
              disabled={currentSpreadIndex === 0}
              className="absolute -left-4 z-40 p-3 bg-[#2a1b10] hover:bg-[#3d2717] disabled:opacity-30 border border-[#d9a05b]/30 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] text-[#d9a05b] transition cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentSpreadIndex === totalSpreads - 1}
              className="absolute -right-4 z-40 p-3 bg-[#2a1b10] hover:bg-[#3d2717] disabled:opacity-30 border border-[#d9a05b]/30 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] text-[#d9a05b] transition cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Notebook Physical Frame */}
        <div className="relative w-full overflow-hidden md:overflow-visible">
          {/* Stacked Pages Shadow Layers (creates depth) */}
          <div className="absolute inset-x-2 -bottom-2 h-full bg-[#120a06]/40 rounded-xl blur-sm -z-10" />
          <div className="absolute inset-x-4 -bottom-4 h-full bg-[#120a06]/20 rounded-xl blur-md -z-20" />
          
          {/* Leather Book Cover Frame */}
          <div 
            className="w-full bg-[#2a1b10] rounded-2xl p-3 md:p-5 border-4 border-[#5c3e21]"
            style={{
              boxShadow: '0 30px 70px -10px rgba(0,0,0,0.8), inset 0 0 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
              perspective: '1500px', // enables 3D transforms
            }}
          >
            {/* Gold border inset inside cover */}
            <div className="absolute inset-2 border border-[#d9a05b]/20 rounded-xl pointer-events-none" />

            {/* Inner Pages Container */}
            <div className="relative min-h-[500px] md:min-h-[580px] rounded-lg overflow-hidden flex bg-[#1e1c18] shadow-inner">
              
              {/* Spine binding for desktop */}
              {!isMobile && (
                <div className="absolute left-1/2 top-0 bottom-0 w-8 -translate-x-1/2 z-30 flex flex-col justify-around py-6 pointer-events-none">
                  {/* Spine depth shadow */}
                  <div className="absolute inset-0 book-spine-shadow" />
                  
                  {/* Ring Bindings */}
                  {[...Array(6)].map((_, i) => (
                    <div 
                      key={i} 
                      className="w-10 h-3 bg-gradient-to-b from-[#b0b0b0] via-[#dfdfdf] to-[#7f7f7f] rounded-full self-center border border-black/40 shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-40 transform translate-x-[1px]"
                      style={{
                        clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Page Contents */}
              {isMobile ? (
                /* Mobile Layout: Single Page view with sliding transition */
                <div className="w-full min-h-[500px] bg-[#fbf8f3] paper-page relative flex flex-col justify-between">
                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                      key={currentPageIndex}
                      custom={direction}
                      variants={{
                        initial: (dir: 'next' | 'prev') => ({
                          x: dir === 'next' ? '100%' : '-100%',
                          opacity: 0,
                        }),
                        animate: {
                          x: 0,
                          opacity: 1,
                          transition: { duration: 0.35, ease: 'easeOut' },
                        },
                        exit: (dir: 'next' | 'prev') => ({
                          x: dir === 'next' ? '-100%' : '100%',
                          opacity: 0,
                          transition: { duration: 0.3, ease: 'easeIn' },
                        }),
                      }}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="absolute inset-0 w-full h-full"
                    >
                      {renderPage(pages[currentPageIndex])}
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : (
                /* Desktop Layout: Open Book View with 3D rotation flip */
                <div className="w-full flex">
                  {/* Left Page */}
                  <div className="w-1/2 bg-[#fbf8f3] border-r border-[#e8dfd0] paper-page relative">
                    <div className="absolute right-0 top-0 bottom-0 w-12 book-fold-left pointer-events-none z-10" />
                    
                    <AnimatePresence mode="wait" custom={direction}>
                      <motion.div
                        key={currentSpreadIndex * 2}
                        custom={direction}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 w-full h-full"
                      >
                        {renderPage(pages[currentSpreadIndex * 2])}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Right Page */}
                  <div className="w-1/2 bg-[#fbf8f3] paper-page relative">
                    <div className="absolute left-0 top-0 bottom-0 w-12 book-fold-right pointer-events-none z-10" />
                    
                    <AnimatePresence mode="wait" custom={direction}>
                      <motion.div
                        key={currentSpreadIndex * 2 + 1}
                        custom={direction}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 w-full h-full"
                      >
                        {renderPage(pages[currentSpreadIndex * 2 + 1])}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Bookmark Ribbon sticking out bottom */}
          <div className="absolute bottom-[-16px] left-[35%] md:left-[48%] w-6 h-12 bg-[#8b2b2b] shadow-md z-20 pointer-events-none rounded-b" 
            style={{
              clipPath: 'polygon(0% 0%, 100% 0%, 100% 80%, 50% 100%, 0% 80%)',
              borderLeft: '1px solid rgba(0,0,0,0.1)',
              borderRight: '1px solid rgba(0,0,0,0.1)',
            }}
          />
        </div>
      </div>

      {/* Navigation & Info Footer (Mobile Layout Only) */}
      {isMobile && (
        <div className="w-full flex justify-between items-center mt-6 bg-[#2a1b10] border border-[#d9a05b]/20 p-3 rounded-lg text-[#faf5eb]">
          <button
            onClick={handlePrev}
            disabled={currentPageIndex === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d9a05b]/10 hover:bg-[#d9a05b]/20 disabled:opacity-30 text-[#d9a05b] text-xs font-bold rounded-full transition cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Prev Page</span>
          </button>
          
          <span className="font-serif italic text-xs text-[#d9a05b]">
            Page {currentPageIndex + 1} of {pages.length}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPageIndex === pages.length - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d9a05b]/10 hover:bg-[#d9a05b]/20 disabled:opacity-30 text-[#d9a05b] text-xs font-bold rounded-full transition cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Next Page</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Numbers Indicator (Desktop Only) */}
      {!isMobile && (
        <div className="mt-4 text-[#d9a05b]/60 font-serif italic text-xs">
          Spread {currentSpreadIndex + 1} of {totalSpreads} (Pages {currentSpreadIndex * 2 + 1} - {Math.min(currentSpreadIndex * 2 + 2, pages.length)})
        </div>
      )}
    </div>
  );
}
