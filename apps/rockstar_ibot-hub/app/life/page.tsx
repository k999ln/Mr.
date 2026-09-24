import Link from 'next/link';
import { env } from 'cloudflare:workers';
import HubDashboard from '../components/hub-dashboard';
import { chatGPTSignOutPath, requireChatGPTUser } from '../chatgpt-auth';
import { getFoundationSnapshot } from '../lib/foundation-store';
import {
  safeReadCoreBilling,
  safeReadCoreAi,
  safeReadCoreBrowser,
  safeReadCoreConnection,
  safeReadCoreMail,
  safeReadCoreMailRail,
  safeReadCoreMaps,
  safeReadCoreSocial,
  safeReadCoreTiming,
  safeReadCoreVendorBank,
  safeReadCoreVoice,
} from '../lib/core-client';
import { getOperatingSnapshot } from '../lib/operating-store';
import { getOrCreatePortfolio } from '../lib/portfolio-store';
import { readStorageHealth } from '../lib/storage-health';

export const dynamic = 'force-dynamic';

export default async function LifeWorkspace() {
  const user = await requireChatGPTUser('/life');
  const [snapshot, operatingSnapshot, foundationSnapshot, coreConnection, coreTiming, coreMail, coreMailRail, coreBilling, coreVoice, coreAi, coreMaps, coreSocial, coreVendorBank, coreBrowser, storageHealth] = await Promise.all([
    getOrCreatePortfolio(user.userId),
    getOperatingSnapshot(user.userId),
    getFoundationSnapshot(user.userId),
    safeReadCoreConnection(user.userId),
    safeReadCoreTiming(user.userId),
    safeReadCoreMail(user.userId),
    safeReadCoreMailRail(user.userId),
    safeReadCoreBilling(user.userId),
    safeReadCoreVoice(user.userId),
    safeReadCoreAi(user.userId),
    safeReadCoreMaps(user.userId),
    safeReadCoreSocial(user.userId),
    safeReadCoreVendorBank(user.userId),
    safeReadCoreBrowser(user.userId),
    readStorageHealth(env.FILES),
  ]);
  return (<>
    <Link className="automation-return" href="/">← 自動化ハブへ</Link>
    <HubDashboard
      initialSnapshot={snapshot}
      initialOperatingSnapshot={operatingSnapshot}
      initialFoundationSnapshot={foundationSnapshot}
      initialCoreConnection={coreConnection}
      initialCoreTiming={coreTiming}
      initialCoreMail={coreMail}
      initialCoreMailRail={coreMailRail}
      initialCoreBilling={coreBilling}
      initialCoreVoice={coreVoice}
      initialCoreAi={coreAi}
      initialCoreMaps={coreMaps}
      initialCoreSocial={coreSocial}
      initialCoreVendorBank={coreVendorBank}
      initialCoreBrowser={coreBrowser}
      initialStorageHealth={storageHealth}
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath('/')}
    />
  </>);
}
