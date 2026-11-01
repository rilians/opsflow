import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { Tasks } from '@/pages/Tasks';
import { Automation } from '@/pages/Automation';
import { Workflows } from '@/pages/Workflows';
import { SlaMonitoring } from '@/pages/SlaMonitoring';
import { Analytics } from '@/pages/Analytics';
import { Reports } from '@/pages/Reports';
import { Notifications } from '@/pages/Notifications';
import { Settings } from '@/pages/Settings';
import { NotFound } from '@/pages/NotFound';

function NotFoundRoute() {
  const location = useLocation();
  return <NotFound path={location.pathname + location.search} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/automation" element={<Automation />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/sla" element={<SlaMonitoring />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
    </Routes>
  );
}
