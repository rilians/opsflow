import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastHost } from '@/components/ui';
import { useStore } from '@/services/store';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('opsflow.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toasts, dismissToast } = useStore();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('opsflow.sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas lg:min-h-0">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5">
          <div key={location.pathname} className="mx-auto w-full max-w-[1560px] animate-page-in">
            <Outlet />
          </div>
        </main>
        <footer className="mt-auto border-t border-ink-200/60 px-5 py-3">
          <div className="mx-auto flex max-w-[1560px] flex-col items-start justify-between gap-1 text-[10.5px] text-ink-400 sm:flex-row sm:items-center">
            <p>
              OpsFlow · Intelligent BAU Automation &amp; Control Tower · <span className="font-semibold text-amber-700">Demo Mode</span> — seeded local dataset,
              no external services connected.
            </p>
            <p className="tabular">Workspace persists in this browser · {new Date().getFullYear()}</p>
          </div>
        </footer>
      </div>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
