import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900 relative">
      {/* Full-Width Top Navbar */}
      <Navbar
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
      />

      {/* Mobile App Style Slide-Over Side Drawer & Backdrop (Laptop & Mobile) */}
      {user && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ease-out ${
            sidebarOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
          role="dialog"
          aria-modal="true"
        >
          {/* Frosted Glass Backdrop with Smooth Fade */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Side Drawer with Native Mobile App Spring Slide-In */}
          <div
            className={`absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-white h-full shadow-[8px_0_36px_rgba(0,0,0,0.18)] flex flex-col z-10 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${user ? 'pb-20 md:pb-0' : ''}`}>
        <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8">
          <Outlet />
        </main>
        <Footer />
      </div>

      {/* Mobile Ergonomic Bottom Tab Navigation */}
      {user && (
        <MobileBottomNav
          onOpenSidebar={() => setSidebarOpen(true)}
          sidebarOpen={sidebarOpen}
        />
      )}
    </div>
  );
};
