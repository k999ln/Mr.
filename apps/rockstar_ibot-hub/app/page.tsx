import AutomationDashboard from './components/automation-dashboard';
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <AutomationDashboard displayName={user?.displayName ?? null}
      accountPath={user ? chatGPTSignOutPath('/') : chatGPTSignInPath('/')} />
  );
}
