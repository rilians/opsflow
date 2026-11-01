import { ArrowLeft, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/shared/Page';

/**
 * Previously every unknown path silently redirected to the dashboard, which made a
 * mistyped deep link look like a successful navigation. A wrong link should look
 * like a wrong link.
 */
export function NotFound({ path }: { path: string }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Page not found"
        description="This address does not match any module in the workspace."
        meta={<code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-600">{path}</code>}
      />
      <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          <Compass className="h-5 w-5" />
        </span>
        <p className="text-[14px] font-semibold text-ink-800">Nothing lives at this route</p>
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
          Check the link, or pick a module from the sidebar. Deep links look like{' '}
          <code className="rounded bg-ink-100 px-1 py-px text-[11px]">/tasks?task=&lt;id&gt;</code> and{' '}
          <code className="rounded bg-ink-100 px-1 py-px text-[11px]">/automation?tab=executions</code>.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>
            Executive overview
          </Button>
        </div>
      </Card>
    </div>
  );
}
