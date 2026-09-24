import { chatGPTSignOutPath, requireChatGPTUser } from '../chatgpt-auth';
import OwnerConsole from '../components/owner-console';
import { getOperatingSnapshot } from '../lib/operating-store';
import { getOrCreatePortfolio } from '../lib/portfolio-store';

export const dynamic = 'force-dynamic';

export default async function OwnerPage() {
  const user = await requireChatGPTUser('/owner');
  const [portfolio, operating] = await Promise.all([
    getOrCreatePortfolio(user.userId),
    getOperatingSnapshot(user.userId),
  ]);

  return (
    <OwnerConsole
      user={{ displayName: user.displayName }}
      signOutPath={chatGPTSignOutPath('/owner')}
      live={{
        connectedCells: portfolio.connectedCount,
        serviceRuns: portfolio.runs.length,
        openTasks: operating.openTaskCount,
        auditEvents: operating.auditEvents.length,
      }}
    />
  );
}
