import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Menu, X } from 'lucide-react';

export function Layout() {
  const { user, loading, settings } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f8f8f8]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#BD8E84]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-[#f8f8f8] overflow-hidden relative">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Subtle Watermark Logo */}
        {settings?.school_logo_url && (
            <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
              <img src={settings.school_logo_url} className="w-[80vw] md:w-[40vw] max-w-4xl max-h-[80vh] object-contain grayscale" alt="" />
            </div>
        )}

        {/* Mobile Header */}
        <header className="lg:hidden relative z-10 bg-white/80 backdrop-blur-md border-b border-[#BD8E84]/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#BD8E84] rounded-lg flex items-center justify-center overflow-hidden">
              {settings?.school_logo_url ? (
                <img src={settings.school_logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-bold text-xs">{settings?.school_name?.[0] || 'S'}</span>
              )}
            </div>
            <span className="font-bold text-slate-900">{settings?.school_name || 'Bright Future Academy'}</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
