'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ExecutionDevice from './execution-device';
import type { ExecutionDeviceState, ExecutionResult } from '../lib/execution-contract.mjs';
import type { ExecutionSnapshot } from '../lib/execution';
import { coreComponents, serviceCells } from '../lib/catalog';
import { aiToolCatalog, type AIToolEffect } from '../lib/ai-tool-catalog';
import {
  foundationCategoriesForKind,
  foundationCategoryLabel,
  foundationKindLabels,
  foundationStatusLabels,
  type FoundationRequestKind,
} from '../lib/foundation-policy';
import type { FoundationSnapshot } from '../lib/foundation-store';
import type {
  CoreConnectionSnapshot,
  CoreBillingCheckoutSnapshot,
  CoreBillingSnapshot,
  CoreAiSnapshot,
  CoreBrowserSnapshot,
  CoreMailConnectionSnapshot,
  CoreMailRailSnapshot,
  CoreMailSendSnapshot,
  CoreMailSnapshot,
  CoreMapsSnapshot,
  CoreSocialSnapshot,
  CoreVendorBankSnapshot,
  CoreRouteSnapshot,
  CoreTimingSnapshot,
  CoreVoiceSnapshot,
} from '../lib/core-client';
import {
  capabilityGroups,
  connections,
  taskDomainLabels,
  type TaskDomain,
} from '../lib/operating-catalog';
import type { OperatingSnapshot } from '../lib/operating-store';
import type { PortfolioSnapshot } from '../lib/portfolio-store';
import type { StorageHealthSnapshot } from '../lib/storage-health';

type HubDashboardProps = {
  initialSnapshot: PortfolioSnapshot;
  initialOperatingSnapshot: OperatingSnapshot;
  initialFoundationSnapshot: FoundationSnapshot;
  initialCoreConnection: CoreConnectionSnapshot;
  initialCoreTiming: CoreTimingSnapshot;
  initialCoreMail: CoreMailSnapshot;
  initialCoreMailRail: CoreMailRailSnapshot;
  initialCoreBilling: CoreBillingSnapshot;
  initialCoreVoice: CoreVoiceSnapshot;
  initialCoreAi: CoreAiSnapshot;
  initialCoreMaps: CoreMapsSnapshot;
  initialCoreSocial: CoreSocialSnapshot;
  initialCoreVendorBank: CoreVendorBankSnapshot;
  initialCoreBrowser: CoreBrowserSnapshot;
  initialStorageHealth: StorageHealthSnapshot;
  user: { displayName: string; email: string };
  signOutPath: string;
};

type DialogState = { type: 'connect' } | { type: 'run'; slotId: string } | null;
type DraftMutation = { fingerprint: string; key: string };

const navigation = [
  ['00', '概要', 'overview'],
  ['01', '今日', 'today'],
  ['02', '身体・心', 'wellbeing'],
  ['03', 'お金', 'money'],
  ['04', '仕事', 'work'],
  ['05', '配給', 'distribution'],
  ['06', 'サービス', 'portfolio'],
  ['07', '接続', 'connections'],
  ['08', '証拠', 'proof'],
] as const;

const auditLabels: Record<string, string> = {
  'portfolio.connected_all': '6サービスを全体連携',
  'portfolio.slot_changed': 'サービス構成を変更',
  'portfolio.reset': 'サービス構成を初期化',
  'service.run_queued': 'サービス実行を受付',
  'task.created': 'タスクを追加',
  'task.status_changed': 'タスク状態を変更',
  'task.deleted': 'タスクを削除',
  'checkin.saved': '身体・心のチェックインを保存',
  'money.entry_created': '収支を記録',
  'money.entry_deleted': '収支記録を削除',
  'foundation.request_created': '財団配給を申請',
  'foundation.request_cancelled': '財団配給申請を取消',
};

const foundationLedgerLabels: Record<string, string> = {
  grant: '付与',
  reserve: '確保',
  consume: '使用確定',
  release: '確保解除',
  expire: '失効',
  adjustment: '訂正',
};

const aiToolEffectLabels: Record<AIToolEffect, string> = {
  read: 'READ',
  external_write: 'EXTERNAL WRITE',
  message: 'MESSAGE',
  publish: 'PUBLISH',
  money: 'MONEY',
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || '操作を完了できませんでした。');
  return body;
}

function isoDay(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const iso = parsed.toISOString();
  return `${iso.slice(5, 10).replace('-', '/')} ${iso.slice(11, 16)} UTC`;
}

function formatMoney(amountMinor: number, currency: string): string {
  const fraction = currency === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(amountMinor / 10 ** fraction);
}

function moneyToMinor(value: string, currency: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  const validAmount = currency === 'JPY' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!validAmount.test(normalized)) return null;
  const factor = currency === 'JPY' ? 1 : 100;
  const result = Math.round(Number(normalized) * factor);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ScorePicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="score-picker">
      <legend><strong>{label}</strong><span>{hint}</span></legend>
      <div>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            type="button"
            key={score}
            className={value === score ? 'selected' : ''}
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function HubDashboard({
  initialSnapshot,
  initialOperatingSnapshot,
  initialFoundationSnapshot,
  initialCoreConnection,
  initialCoreTiming,
  initialCoreMail,
  initialCoreMailRail,
  initialCoreBilling,
  initialCoreVoice,
  initialCoreAi,
  initialCoreMaps,
  initialCoreSocial,
  initialCoreVendorBank,
  initialCoreBrowser,
  initialStorageHealth,
  user,
  signOutPath,
}: HubDashboardProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [executionDevice,setExecutionDevice]=useState<ExecutionDeviceState>({paired:false,ready:false,lastSeenAt:null});
  const [executionLoadError,setExecutionLoadError]=useState('');
  async function refreshExecutions(){
    const response=await fetch('/api/runs',{cache:'no-store'});
    if(!response.ok)throw new Error('実行状況を確認できませんでした。');
    const next=await response.json() as ExecutionSnapshot;setSnapshot(next);setExecutionDevice(next.executionDevice);setExecutionLoadError('');
  }
  useEffect(()=>{
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
    async function poll(){
      controller=new AbortController();
      try{
        const response=await fetch('/api/runs',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('unavailable');
        const next=await response.json() as ExecutionSnapshot;
        if(!cancelled){setSnapshot(next);setExecutionDevice(next.executionDevice);setExecutionLoadError('');}
      }catch{if(!cancelled){setExecutionDevice(previous=>({...previous,ready:false}));setExecutionLoadError('実行状況を確認できません。接続を確認してください。');}}
      finally{if(!cancelled)timer=setTimeout(poll,8000);}
    }
    void poll();return()=>{cancelled=true;clearTimeout(timer);controller?.abort();};
  },[]);
  async function cancelRun(id:string){
    try{const response=await fetch('/api/runs',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'cancel',id})});if(!response.ok)throw new Error('取消できませんでした。');await refreshExecutions();setNotice('依頼を取り消しました。遅れて届いた結果は保存しません。');}catch(error){setNotice(error instanceof Error?error.message:'取消できませんでした。');}
  }
  async function copyResult(result:ExecutionResult){
    try{await navigator.clipboard.writeText(`${result.title}\n\n${result.body}\n\n確認事項\n${result.checks.join('\n')}\n\n注意事項\n${result.warnings.join('\n')}`);setNotice('成果物をコピーしました。');}catch{setNotice('本文を選択してコピーしてください。');}
  }
  const [operating, setOperating] = useState(initialOperatingSnapshot);
  const [foundation, setFoundation] = useState(initialFoundationSnapshot);
  const [coreConnection, setCoreConnection] = useState(initialCoreConnection);
  const [coreTiming, setCoreTiming] = useState(initialCoreTiming);
  const [coreMail, setCoreMail] = useState(initialCoreMail);
  const [coreMailRail, setCoreMailRail] = useState(initialCoreMailRail);
  const [coreBilling, setCoreBilling] = useState(initialCoreBilling);
  const [coreVoice, setCoreVoice] = useState(initialCoreVoice);
  const [coreAi, setCoreAi] = useState(initialCoreAi);
  const [coreMaps, setCoreMaps] = useState(initialCoreMaps);
  const [coreSocial, setCoreSocial] = useState(initialCoreSocial);
  const [coreVendorBank, setCoreVendorBank] = useState(initialCoreVendorBank);
  const [coreBrowser, setCoreBrowser] = useState(initialCoreBrowser);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('準備完了。今日の一手から始められます。');
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef<string | null>(null);
  const taskMutationRef = useRef<DraftMutation | null>(null);
  const moneyMutationRef = useRef<DraftMutation | null>(null);
  const runMutationRef = useRef<DraftMutation | null>(null);
  const portfolioMutationRef = useRef<DraftMutation | null>(null);
  const foundationMutationRef = useRef<DraftMutation | null>(null);
  const coreLinkMutationRef = useRef<DraftMutation | null>(null);
  const coreMailMutationRef = useRef<DraftMutation | null>(null);
  const coreMailSendMutationRef = useRef<DraftMutation | null>(null);
  const coreBillingMutationRef = useRef<DraftMutation | null>(null);
  const coreMapsMutationRef = useRef<DraftMutation | null>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDomain, setTaskDomain] = useState<TaskDomain>('today');
  const [taskDueAt, setTaskDueAt] = useState('');

  const [checkinDay, setCheckinDay] = useState('');
  const [bodyScore, setBodyScore] = useState(3);
  const [mindScore, setMindScore] = useState(3);
  const [energyScore, setEnergyScore] = useState(3);
  const [checkinNote, setCheckinNote] = useState('');

  const [moneyDirection, setMoneyDirection] = useState<'income' | 'expense'>('income');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyCurrency, setMoneyCurrency] = useState('JPY');
  const [moneyCategory, setMoneyCategory] = useState('仕事');
  const [moneyNote, setMoneyNote] = useState('');
  const [moneyDay, setMoneyDay] = useState('');

  const [foundationKind, setFoundationKind] = useState<FoundationRequestKind>('service_access');
  const [foundationCategory, setFoundationCategory] = useState('youtube_script');
  const [foundationUnits, setFoundationUnits] = useState('1');
  const [foundationPurpose, setFoundationPurpose] = useState('');
  const [foundationAttested, setFoundationAttested] = useState(false);
  const [routeOriginLatitude, setRouteOriginLatitude] = useState('');
  const [routeOriginLongitude, setRouteOriginLongitude] = useState('');
  const [routeDestinationLatitude, setRouteDestinationLatitude] = useState('');
  const [routeDestinationLongitude, setRouteDestinationLongitude] = useState('');
  const [routeTravelMode, setRouteTravelMode] = useState<'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT'>('DRIVE');
  const [routeResult, setRouteResult] = useState<CoreRouteSnapshot | null>(null);
  const [mailRecipient, setMailRecipient] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  const selectedRunCell = useMemo(
    () => (dialog?.type === 'run' ? serviceCells.find((cell) => cell.slotId === dialog.slotId) : null),
    [dialog],
  );
  const workTasks = operating.tasks.filter((task) => task.domain === 'work');
  const foundationCategoryOptions = foundationCategoriesForKind(foundationKind);
  const checkinAverage = operating.checkin
    ? Math.round(
        ((operating.checkin.bodyScore + operating.checkin.mindScore + operating.checkin.energyScore) / 3) * 10,
      ) / 10
    : null;
  const corePreferences = coreConnection.preferences;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const today = isoDay();
      setCheckinDay(today);
      setMoneyDay(today);
      if (initialOperatingSnapshot.checkin?.day === today) {
        setBodyScore(initialOperatingSnapshot.checkin.bodyScore);
        setMindScore(initialOperatingSnapshot.checkin.mindScore);
        setEnergyScore(initialOperatingSnapshot.checkin.energyScore);
        setCheckinNote(initialOperatingSnapshot.checkin.note);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialOperatingSnapshot.checkin]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!dialog) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const modal = dialogRef.current;
    window.requestAnimationFrame(() => modal?.focus());
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        setDialog(null);
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => {
      window.removeEventListener('keydown', handleDialogKeys);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [dialog]);

  useEffect(() => {
    if (coreConnection.status !== 'pending') return;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const next = await responseJson<CoreConnectionSnapshot>(
          await fetch('/api/connections/telegram', { cache: 'no-store' }),
        );
        setCoreConnection(next);
        if (next.status === 'linked') {
          setNotice('avocadomini BotとHubの本人リンクが完了しました。');
          window.clearInterval(timer);
        } else if (attempts >= 20) {
          window.clearInterval(timer);
        }
      } catch {
        if (attempts >= 20) window.clearInterval(timer);
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [coreConnection.status]);

  const slotState = (slotId: string) => snapshot.slots.find((slot) => slot.slotId === slotId);

  function keyForDraft(
    reference: { current: DraftMutation | null },
    fingerprint: string,
  ): string {
    if (reference.current?.fingerprint === fingerprint) return reference.current.key;
    const key = crypto.randomUUID();
    reference.current = { fingerprint, key };
    return key;
  }

  async function mutatePortfolio(
    key: string,
    url: string,
    idempotencyKey: string,
    body?: Record<string, unknown>,
  ) {
    setBusy(key);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const next = await responseJson<PortfolioSnapshot>(response);
      setSnapshot(next);
      return next;
    } finally {
      setBusy(null);
    }
  }

  async function mutateOperating(
    key: string,
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    setBusy(key);
    try {
      const next = await responseJson<OperatingSnapshot>(
        await fetch(url, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
      setOperating(next);
      return next;
    } finally {
      setBusy(null);
    }
  }

  async function connectEverything() {
    const idempotencyKey = keyForDraft(
      portfolioMutationRef,
      JSON.stringify({ operation: 'connect-all' }),
    );
    try {
      await mutatePortfolio('connect', '/api/portfolio/connect-all', idempotencyKey);
      portfolioMutationRef.current = null;
      setNotice('6サービスを選択しました。実行環境を接続し、実行可能になったサービスへ依頼できます。');
      setDialog(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '全体連携に失敗しました。');
    }
  }

  async function beginTelegramLink() {
    const idempotencyKey = keyForDraft(
      coreLinkMutationRef,
      JSON.stringify({ operation: 'telegram-link' }),
    );
    setBusy('telegram:link');
    try {
      const next = await responseJson<CoreConnectionSnapshot>(
        await fetch('/api/connections/telegram', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      );
      setCoreConnection(next);
      if (next.status === 'linked') {
        coreLinkMutationRef.current = null;
        setNotice('avocadomini Botはすでに本人リンク済みです。');
      } else {
        setNotice('リンクを発行しました。avocadomini Botを開いてSTARTを押してください。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Telegramリンクを発行できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshTelegramLink() {
    setBusy('telegram:refresh');
    try {
      const next = await responseJson<CoreConnectionSnapshot>(
        await fetch('/api/connections/telegram', { cache: 'no-store' }),
      );
      setCoreConnection(next);
      if (next.status === 'linked') {
        coreLinkMutationRef.current = null;
        setNotice('avocadomini BotとHubの本人リンクを確認しました。');
      } else {
        setNotice('avocadomini BotでSTARTを押した後、もう一度確認してください。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Telegramリンクを確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function updateCorePreferences(preferences: Record<string, unknown>) {
    setBusy('telegram:preferences');
    try {
      const next = await responseJson<CoreConnectionSnapshot>(
        await fetch('/api/connections/telegram', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(preferences),
        }),
      );
      setCoreConnection(next);
      if (next.preferences) {
        setCoreTiming((current) => ({
          ...current,
          notifications: {
            ...current.notifications,
            notificationsEnabled: next.preferences?.notificationsEnabled ?? current.notifications.notificationsEnabled,
            dailyAutomationEnabled: next.preferences?.dailyAutomationEnabled ?? current.notifications.dailyAutomationEnabled,
          },
        }));
      }
      setNotice('avocadomini Botの設定をCloudflare Coreへ保存しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'avocadomini Botの設定を保存できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreTiming() {
    setBusy('timing:refresh');
    try {
      const next = await responseJson<CoreTimingSnapshot>(
        await fetch('/api/connections/timing', { cache: 'no-store' }),
      );
      setCoreTiming(next);
      setNotice('Timing Coreの状態を更新しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Timing Coreの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function syncCoreCalendar() {
    setBusy('calendar:sync');
    try {
      const next = await responseJson<CoreTimingSnapshot>(
        await fetch('/api/connections/timing', { method: 'POST' }),
      );
      setCoreTiming(next);
      setNotice(`Google Calendarを同期しました。busy時間は${next.calendar.busyIntervalCount}件です。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Google Calendarを同期できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function beginGmailLink() {
    const idempotencyKey = keyForDraft(
      coreMailMutationRef,
      JSON.stringify({ operation: 'gmail-link' }),
    );
    setBusy('mail:connect');
    try {
      const next = await responseJson<CoreMailConnectionSnapshot>(
        await fetch('/api/connections/mail', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      );
      if (next.status === 'connected') {
        coreMailMutationRef.current = null;
        setCoreMail({ status: 'connected', configured: true, verifiedAt: next.verifiedAt });
        setNotice('このGmailはすでに本人接続済みです。');
      } else if (next.status === 'ready' && next.redirectUrl) {
        setNotice('Googleの本人確認画面へ移動します。');
        window.location.assign(next.redirectUrl);
      } else {
        setNotice('Gmail接続リンクを準備しています。少し待ってもう一度押してください。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Gmail接続を開始できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshMailRail() {
    setBusy('mail-rail:refresh');
    try {
      const next = await responseJson<CoreMailRailSnapshot>(
        await fetch('/api/connections/mail-delivery', { cache: 'no-store' }),
      );
      setCoreMailRail(next);
      setNotice(next.status === 'verified'
        ? `${next.sendingDomain}の送信と${next.replyDomain}の署名返信受信を本人環境で照合しました。`
        : '本人所有メールの送受信設定はまだ完了していません。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本人所有メールの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function sendOwnedMail() {
    const draft = { to: mailRecipient.trim(), emailSubject: mailSubject.trim(), text: mailBody };
    if (!draft.to || !draft.emailSubject || !draft.text.trim()) {
      setNotice('宛先・件名・本文を入力してください。');
      return;
    }
    if (!window.confirm(`${draft.to}へ本人所有ドメインからメールを1通送信しますか？ Resendの利用量に計上される場合があります。`)) return;
    const idempotencyKey = keyForDraft(coreMailSendMutationRef, JSON.stringify(draft));
    setBusy('mail-rail:send');
    try {
      const result = await responseJson<CoreMailSendSnapshot>(
        await fetch('/api/connections/mail-delivery', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(draft),
        }),
      );
      coreMailSendMutationRef.current = null;
      setCoreMailRail((current) => ({ ...current, status: 'verified', credentialVerified: true, inboundReady: true }));
      setNotice(result.cached ? '同じメールの送信receiptを確認しました。二重送信はしていません。' : '本人所有ドメインからメールを送信しました。返信は署名Webhookで暗号化して取り込みます。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'メールを送信できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function beginStripeCheckout() {
    const idempotencyKey = keyForDraft(
      coreBillingMutationRef,
      JSON.stringify({ operation: 'stripe-checkout' }),
    );
    setBusy('billing:checkout');
    try {
      const next = await responseJson<CoreBillingCheckoutSnapshot>(
        await fetch('/api/connections/billing', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      );
      if (next.status === 'active') {
        coreBillingMutationRef.current = null;
        setCoreBilling({ status: 'active', configured: true, paid: true, planStatus: next.planStatus });
        setNotice('Stripeのサービス利用状態は有効です。');
      } else if (next.status === 'ready' && next.checkoutUrl) {
        setNotice('Kai所有Stripeの決済画面へ移動します。');
        window.location.assign(next.checkoutUrl);
      } else {
        setNotice('この決済参照は使用済みです。状態を再確認してください。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stripe決済を開始できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreVoice() {
    setBusy('voice:refresh');
    try {
      const next = await responseJson<CoreVoiceSnapshot>(
        await fetch('/api/connections/voice', { cache: 'no-store' }),
      );
      setCoreVoice(next);
      setNotice(next.status === 'verified'
        ? 'Telnyxの番号・接続先・署名Webhookを本人環境で照合しました。発信はまだ無効です。'
        : 'Telnyxの所有設定はまだ一致していません。発信は無効のままです。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Telnyxの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreAi() {
    setBusy('ai:refresh');
    try {
      const next = await responseJson<CoreAiSnapshot>(
        await fetch('/api/connections/ai', { cache: 'no-store' }),
      );
      setCoreAi(next);
      setNotice(next.status === 'verified'
        ? `Gemini credentialと${next.model || '固定モデル'}をreadbackしました。AI生成はまだ無効です。`
        : 'Gemini credentialはまだ確認できません。AI生成は無効のままです。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Geminiの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreMaps() {
    setBusy('maps:refresh');
    try {
      const next = await responseJson<CoreMapsSnapshot>(
        await fetch('/api/connections/maps', { cache: 'no-store' }),
      );
      setCoreMaps(next);
      setNotice(next.credentialVerified
        ? 'Google Routes APIの成功receiptを確認しました。'
        : 'Maps専用credentialは設定済みですが、まだ経路計算receiptがありません。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mapsの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreSocial() {
    setBusy('social:refresh');
    try {
      const next = await responseJson<CoreSocialSnapshot>(
        await fetch('/api/connections/social', { cache: 'no-store' }),
      );
      setCoreSocial(next);
      setNotice(next.status === 'verified'
        ? `Postizで本人所有SNS ${next.integrations.length}件をreadbackしました。投稿はまだ無効です。`
        : 'Postizのintegration ID・種別・公開プロフィールが設定値と一致していません。投稿は無効のままです。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'SNSの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreVendorBank() {
    setBusy('vendor-bank:refresh');
    try {
      const next = await responseJson<CoreVendorBankSnapshot>(
        await fetch('/api/connections/vendor-bank', { cache: 'no-store' }),
      );
      setCoreVendorBank(next);
      setNotice(next.status === 'verified'
        ? '本人名義のGMOあおぞら法人口座をreadbackしました。振込実行はまだ無効です。'
        : '銀行API credential・口座ID・円普通預金の一致を確認できません。振込実行は無効のままです。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本人法人口座の状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function refreshCoreBrowser() {
    setBusy('browser:refresh');
    try {
      const next = await responseJson<CoreBrowserSnapshot>(
        await fetch('/api/connections/browser', { cache: 'no-store' }),
      );
      setCoreBrowser(next);
      setNotice(next.status === 'verified'
        ? 'Cloudflare Browser専用tokenと本人accountをreadbackしました。ブラウザ実行はまだ無効です。'
        : 'Cloudflare Browser専用tokenと本人accountを確認できません。ブラウザ実行は無効のままです。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cloudflare Browserの状態を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function computePrivateRoute() {
    const values = [
      routeOriginLatitude,
      routeOriginLongitude,
      routeDestinationLatitude,
      routeDestinationLongitude,
    ].map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value))) {
      setNotice('出発地と目的地の緯度・経度を入力してください。');
      return;
    }
    if (!window.confirm('入力した座標を一度だけGoogle Routes APIへ送り、経路を計算しますか？ このAPI呼び出しはGoogle側の利用量に計上される場合があります。')) return;
    const draft = {
      origin: { latitude: values[0], longitude: values[1] },
      destination: { latitude: values[2], longitude: values[3] },
      travelMode: routeTravelMode,
    };
    const idempotencyKey = keyForDraft(coreMapsMutationRef, JSON.stringify(draft));
    setBusy('maps:compute');
    try {
      const result = await responseJson<CoreRouteSnapshot>(
        await fetch('/api/connections/maps', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(draft),
        }),
      );
      setRouteResult(result);
      setCoreMaps({ status: 'verified', configured: true, credentialVerified: true });
      coreMapsMutationRef.current = null;
      setNotice(`経路は約${Math.ceil(result.durationSeconds / 60)}分・${(result.distanceMeters / 1000).toFixed(1)}kmです。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '経路を計算できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function updateSlot(slotId: string, cellId: string, enabled: boolean) {
    const draft = { slotId, cellId, enabled };
    const idempotencyKey = keyForDraft(
      portfolioMutationRef,
      JSON.stringify({ operation: 'set-slot', ...draft }),
    );
    try {
      await mutatePortfolio(`slot:${slotId}`, '/api/portfolio/slots', idempotencyKey, draft);
      portfolioMutationRef.current = null;
      setNotice(enabled ? 'サービスを選択しました。実行環境の状態を確認してください。' : 'サービスの選択を解除しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '設定の保存に失敗しました。');
    }
  }

  async function resetEverything() {
    if (!window.confirm('6つの連携と選択内容を初期状態に戻しますか？')) return;
    const idempotencyKey = keyForDraft(
      portfolioMutationRef,
      JSON.stringify({ operation: 'reset-portfolio' }),
    );
    try {
      await mutatePortfolio('reset', '/api/portfolio/reset', idempotencyKey);
      portfolioMutationRef.current = null;
      setNotice('Service Cellを初期状態に戻しました。履歴は証拠として残しています。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '初期化に失敗しました。');
    }
  }

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = {
      title: taskTitle.trim(),
      domain: taskDomain,
      dueAt: taskDueAt || undefined,
    };
    const idempotencyKey = keyForDraft(taskMutationRef, JSON.stringify(draft));
    try {
      await mutateOperating(
        'task:create',
        '/api/operating/tasks',
        'POST',
        draft,
        idempotencyKey,
      );
      taskMutationRef.current = null;
      setTaskTitle('');
      setTaskDueAt('');
      setNotice('次の一手を保存しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'タスクを保存できませんでした。');
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    try {
      await mutateOperating(`task:${taskId}`, '/api/operating/tasks', 'PATCH', { taskId, completed });
      setNotice(completed ? '完了を記録しました。' : 'タスクを未完了へ戻しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'タスクを更新できませんでした。');
    }
  }

  async function removeTask(taskId: string) {
    if (!window.confirm('このタスクを削除しますか？')) return;
    try {
      await mutateOperating(`task:${taskId}`, '/api/operating/tasks', 'DELETE', { taskId });
      setNotice('タスクを削除しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'タスクを削除できませんでした。');
    }
  }

  async function submitCheckin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const day = isoDay();
    if (checkinDay && checkinDay !== day) {
      setCheckinDay(day);
      setBodyScore(3);
      setMindScore(3);
      setEnergyScore(3);
      setCheckinNote('');
      setNotice('日付が変わったため、今日の入力へ初期化しました。もう一度入力してください。');
      return;
    }
    try {
      const next = await mutateOperating('checkin', '/api/operating/checkin', 'POST', {
        day,
        bodyScore,
        mindScore,
        energyScore,
        note: checkinNote,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      if (next.checkin?.day === day) {
        setBodyScore(next.checkin.bodyScore);
        setMindScore(next.checkin.mindScore);
        setEnergyScore(next.checkin.energyScore);
        setCheckinNote(next.checkin.note);
      }
      setNotice(`${day}の身体・心・エネルギーを保存しました。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'チェックインを保存できませんでした。');
    }
  }

  async function submitMoney(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = moneyToMinor(moneyAmount, moneyCurrency);
    if (!amountMinor) {
      setNotice('金額を正しく入力してください。');
      return;
    }
    const draft = {
      direction: moneyDirection,
      amountMinor,
      currency: moneyCurrency,
      category: moneyCategory.trim(),
      note: moneyNote.trim(),
      occurredAt: moneyDay,
    };
    const idempotencyKey = keyForDraft(moneyMutationRef, JSON.stringify(draft));
    try {
      await mutateOperating(
        'money:create',
        '/api/operating/money',
        'POST',
        draft,
        idempotencyKey,
      );
      moneyMutationRef.current = null;
      setMoneyAmount('');
      setMoneyNote('');
      setNotice('収支を台帳へ保存しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '収支を保存できませんでした。');
    }
  }

  async function removeMoneyEntry(entryId: string) {
    if (!window.confirm('この収支記録を削除しますか？')) return;
    try {
      await mutateOperating(`money:${entryId}`, '/api/operating/money', 'DELETE', { entryId });
      setNotice('収支記録を削除しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '収支を削除できませんでした。');
    }
  }

  function selectFoundationKind(kind: FoundationRequestKind) {
    setFoundationKind(kind);
    setFoundationCategory(foundationCategoriesForKind(kind)[0][0]);
    setFoundationUnits(kind === 'essentials_support' ? '0' : '1');
  }

  async function submitFoundationRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedUnits = foundationKind === 'essentials_support'
      ? 0
      : Number(foundationUnits);
    const draft = {
      kind: foundationKind,
      category: foundationCategory,
      requestedUnits,
      purposeSummary: foundationPurpose.trim(),
      attested: foundationAttested,
    };
    const idempotencyKey = keyForDraft(foundationMutationRef, JSON.stringify(draft));
    setBusy('foundation:create');
    try {
      const next = await responseJson<FoundationSnapshot>(
        await fetch('/api/foundation/distribution', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(draft),
        }),
      );
      setFoundation(next);
      foundationMutationRef.current = null;
      setFoundationPurpose('');
      setFoundationAttested(false);
      setNotice('財団設立準備の配給申請を受付しました。支給・承認はまだ完了していません。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '配給申請を保存できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function cancelFoundationRequest(requestId: string) {
    if (!window.confirm('この配給申請を取り消しますか？')) return;
    const draft = { action: 'cancel', requestId };
    const idempotencyKey = keyForDraft(foundationMutationRef, JSON.stringify(draft));
    setBusy(`foundation:cancel:${requestId}`);
    try {
      const next = await responseJson<FoundationSnapshot>(
        await fetch('/api/foundation/distribution', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(draft),
        }),
      );
      setFoundation(next);
      foundationMutationRef.current = null;
      setNotice('配給申請を取り消しました。取消のreceiptを保存しています。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '配給申請を取り消せませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function eraseHubData() {
    const confirmation = window.prompt(
      'Today・チェックイン・収支・配給申請と台帳・サービス受付・添付・監査を削除します。現在は非公開pilotで、クラッシュ後の遅延uploadを回収するdurable reaperは公開前の実装項目です。続ける場合は DELETE MY HUB DATA と入力してください。',
    );
    if (confirmation !== 'DELETE MY HUB DATA') {
      if (confirmation !== null) setNotice('確認文字が一致しないため、削除しませんでした。');
      return;
    }
    setBusy('data:erase');
    try {
      await responseJson<{ deleted: true }>(
        await fetch('/api/data', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirmation }),
        }),
      );
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Hub保存データを削除できませんでした。');
      setBusy(null);
    }
  }

  async function submitRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRunCell) return;
    if(!executionDevice.ready){setNotice('実行環境を接続してから依頼してください。');return;}
    if(file&&(!/\.(txt|md|json)$/i.test(file.name)||file.size>65_536)){setNotice('添付は64KB以内のtxt・md・jsonにしてください。');return;}
    const selectedSlot = slotState(selectedRunCell.slotId);
    if (!selectedSlot?.enabled) {
      setNotice('サービス設定が更新されました。画面を更新して再試行してください。');
      return;
    }
    const cleanSummary = summary.trim();
    const contentSha256 = file ? await fileSha256(file) : null;
    const fingerprint = JSON.stringify({
      slotId: selectedRunCell.slotId,
      cellId: selectedSlot.cellId,
      summary: cleanSummary,
      file: file ? [file.name, file.size, file.type, contentSha256] : null,
    });
    const idempotencyKey = keyForDraft(runMutationRef, fingerprint);
    setBusy(`run:${selectedRunCell.slotId}`);
    try {
      let fileId: string | undefined;
      if (file) {
        const form = new FormData();
        form.set('file', file);
        const upload = await responseJson<{ fileId: string }>(
          await fetch('/api/files', {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: form,
          }),
        );
        fileId = upload.fileId;
      }
      const next = await responseJson<PortfolioSnapshot>(
        await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            slotId: selectedRunCell.slotId,
            cellId: selectedSlot.cellId,
            summary: cleanSummary,
            fileId,
            executionConsent:true,
          }),
        }),
      );
      setSnapshot(next);
      runMutationRef.current = null;
      setSummary('');
      setFile(null);
      setDialog(null);
      setNotice('実行を依頼しました。接続した端末で処理し、下の実行履歴に成果物が表示されます。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '実行受付に失敗しました。');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="hub-shell">
      <a className="skip-link" href="#main-content">メイン内容へ移動</a>
      <aside className="rail" aria-label="メインナビゲーション" inert={dialog ? true : undefined}>
        <a className="brand-mark" href="#overview" aria-label="avocadomini ホーム">A</a>
        <nav className="rail-nav">
          {navigation.map(([index, label, id]) => (
            <a href={`#${id}`} key={id}><span>{index}</span>{label}</a>
          ))}
          <a href="/owner"><span>09</span>管理</a>
        </nav>
        <div className="rail-bottom">AVOCADO / OWNER HUB</div>
      </aside>

      <section className="workspace" id="main-content" inert={dialog ? true : undefined}>
        <header className="topbar">
          <div>
            <p className="eyebrow">AVOCADOMINI / OWNER HUB</p>
            <p className="top-title">生活と仕事を動かす、ひとつの共通エンジン</p>
          </div>
          <div className="identity-wrap">
            <div className="identity" title={user.email}>
              <span className="live-dot" />
              <span>{user.displayName}</span>
            </div>
            <a className="owner-console-link" href="/owner">管理</a>
            <a className="signout" href={signOutPath}>ログアウト</a>
          </div>
        </header>

        <section className="hero-grid" id="overview">
          <div className="hero-copy">
            <p className="section-index">00 / AVOCADOMINI HUB</p>
            <h1>Your work and life.<br />One command.</h1>
            <p className="lede">
              今日、身体、心、お金、仕事、配給、サービス、接続、証拠。
              記録だけで終わらず、次の一手と実行へつなぐavocadominiです。
            </p>
            <div className="core-strip" aria-label="avocadomini Core">
              {coreComponents.map((component) => (
                <div className="core-item" key={component.id} title={component.description}>
                  <span>{component.label}</span>
                  <strong>{component.name}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={`command-card ${snapshot.connectedAll ? 'is-connected' : ''}`}>
            <div className="command-meta">
              <span>SERVICE STATUS</span>
              <strong>{snapshot.connectedCount} / {serviceCells.length}</strong>
            </div>
            <div className="status-orbit" aria-hidden="true">
              {serviceCells.map((cell, index) => (
                <span key={cell.slotId} className={slotState(cell.slotId)?.enabled ? 'on' : ''} style={{ '--orbit-index': index } as React.CSSProperties} />
              ))}
              <b>{snapshot.connectedAll ? 'SYNC' : 'READY'}</b>
            </div>
            <button className="connect-button" type="button" onClick={() => setDialog({ type: 'connect' })} disabled={Boolean(busy)}>
              <span>{snapshot.connectedAll ? 'サービスの選択を確認' : '6サービスを選ぶ'}</span><b>↗</b>
            </button>
            <p>承認したService Cellだけを接続します。接続と仕事の完了は別の状態です。</p>
          </div>
        </section>

        <section className="metric-strip" aria-label="現在の状態">
          <article><span>OPEN TASKS</span><strong>{operating.openTaskCount}</strong><p>次にできる行動</p></article>
          <article><span>DAILY CHECK-IN</span><strong>{checkinAverage ?? '—'}</strong><p>{operating.checkin?.day ?? 'まだ記録なし'}</p></article>
          <article><span>SERVICE RUNS</span><strong>{snapshot.runs.length}</strong><p>受付履歴</p></article>
          <article><span>CONNECTED</span><strong>{snapshot.connectedCount}</strong><p>有効なService Cell</p></article>
          <article><span>ALLOCATION</span><strong>{foundation.account.availableUnits}</strong><p>非換金の利用可能unit</p></article>
        </section>

        <div className="notice-bar" role="status" aria-live="polite"><span>SYSTEM</span>{notice}</div>

        <section className="hub-section" id="today">
          <div className="section-heading">
            <div><p className="section-index">01 / TODAY</p><h2>次の一手を、今日の行動へ。</h2></div>
            <p>身体・心・お金・仕事を一つのリストで扱い、領域ごとに見失いません。</p>
          </div>
          <div className="today-grid">
            <article className="panel-card compose-card">
              <p className="card-kicker">ADD NEXT ACTION</p><h3>何を前に進めますか？</h3>
              <form className="task-compose" onSubmit={submitTask}>
                <label className="wide-field">次の一手
                  <input required minLength={2} maxLength={240} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="例：LPの見出しを確定する" />
                </label>
                <label>領域
                  <select value={taskDomain} onChange={(event) => setTaskDomain(event.target.value as TaskDomain)}>
                    {Object.entries(taskDomainLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label>期限（任意）<input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></label>
                <button className="solid-button" type="submit" disabled={Boolean(busy) || taskTitle.trim().length < 2}>{busy === 'task:create' ? '保存中…' : '一手を追加'}</button>
              </form>
            </article>

            <article className="panel-card task-panel">
              <div className="panel-title"><div><p className="card-kicker">ACTIVE QUEUE</p><h3>今日のリスト</h3></div><b>{operating.openTaskCount}</b></div>
              {operating.tasks.length ? (
                <div className="task-list">
                  {operating.tasks.slice(0, 14).map((task) => (
                    <div className={task.completed ? 'completed' : ''} key={task.id}>
                      <button className="task-check" type="button" aria-label={task.completed ? `${task.title}を未完了へ戻す` : `${task.title}を完了する`} onClick={() => toggleTask(task.id, !task.completed)} disabled={Boolean(busy)}>{task.completed ? '✓' : ''}</button>
                      <div><strong>{task.title}</strong><p>{taskDomainLabels[task.domain]}{task.dueAt ? ` · ${task.dueAt}` : ''}</p></div>
                      <button className="icon-button" type="button" aria-label={`${task.title}を削除`} onClick={() => removeTask(task.id)} disabled={Boolean(busy)}>×</button>
                    </div>
                  ))}
                </div>
              ) : <div className="compact-empty"><span>QUEUE EMPTY</span><p>最初の一手を追加すると、ここから動き始めます。</p></div>}
            </article>
          </div>
        </section>

        <section className="hub-section tinted-section" id="wellbeing">
          <div className="section-heading">
            <div><p className="section-index">02 / BODY + MIND</p><h2>状態を知ってから、動かす。</h2></div>
            <p>診断ではありません。自分の変化を見つけ、必要な支援へつなぐ日次記録です。</p>
          </div>
          <div className="wellbeing-grid">
            <form className="panel-card checkin-card" onSubmit={submitCheckin}>
              <div className="panel-title">
                <div><p className="card-kicker">DAILY CHECK-IN</p><h3>今日の状態</h3></div>
                <time className="checkin-day" dateTime={checkinDay}>{checkinDay || '今日'}</time>
              </div>
              <ScorePicker label="身体" hint="重い → 軽い" value={bodyScore} onChange={setBodyScore} />
              <ScorePicker label="心" hint="つらい → 安定" value={mindScore} onChange={setMindScore} />
              <ScorePicker label="エネルギー" hint="低い → 高い" value={energyScore} onChange={setEnergyScore} />
              <label className="note-field">メモ（任意）
                <textarea maxLength={500} value={checkinNote} onChange={(event) => setCheckinNote(event.target.value)} placeholder="睡眠、気分、気になること" />
                <span>{checkinNote.length} / 500</span>
              </label>
              <button className="solid-button" type="submit" disabled={Boolean(busy)}>{busy === 'checkin' ? '保存中…' : 'チェックインを保存'}</button>
            </form>

            <div className="wellbeing-summary">
              {capabilityGroups.filter((group) => group.id === 'body' || group.id === 'mind').map((group) => (
                <article className="capability-card" key={group.id}>
                  <p className="card-kicker">{group.label}</p><h3>{group.name}</h3><p>{group.description}</p>
                  <ul>{group.capabilities.map((capability) => (
                    <li key={capability.id}><span>{capability.name}</span><b data-status={capability.status}>{capability.status === 'hub' ? 'このHub' : 'Core接続'}</b></li>
                  ))}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="hub-section" id="money">
          <div className="section-heading">
            <div><p className="section-index">03 / MONEY</p><h2>お金を、推測ではなく事実で。</h2></div>
            <p>手入力した収支は通貨ごとに集計します。Walletや実決済はCore接続後も別承認です。</p>
          </div>
          <div className="money-layout">
            <div className="money-totals">
              {operating.moneyTotals.length ? operating.moneyTotals.map((total) => (
                <article key={total.currency}><span>{total.currency} / NET</span><strong>{formatMoney(total.netMinor, total.currency)}</strong><p>収入 {formatMoney(total.incomeMinor, total.currency)} · 支出 {formatMoney(total.expenseMinor, total.currency)}</p></article>
              )) : <article><span>MONEY LENS</span><strong>—</strong><p>最初の収支を記録してください。</p></article>}
            </div>
            <form className="panel-card money-form" onSubmit={submitMoney}>
              <p className="card-kicker">NEW LEDGER ENTRY</p><h3>収支を記録</h3>
              <div className="form-grid">
                <label>種類<select value={moneyDirection} onChange={(event) => setMoneyDirection(event.target.value as 'income' | 'expense')}><option value="income">収入</option><option value="expense">支出</option></select></label>
                <label>通貨<select value={moneyCurrency} onChange={(event) => setMoneyCurrency(event.target.value)}><option value="JPY">JPY</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
                <label>金額<input required inputMode="decimal" value={moneyAmount} onChange={(event) => setMoneyAmount(event.target.value)} placeholder={moneyCurrency === 'JPY' ? '10000' : '100.00'} /></label>
                <label>分類<input required maxLength={80} value={moneyCategory} onChange={(event) => setMoneyCategory(event.target.value)} /></label>
                <label>日付<input required type="date" value={moneyDay} onChange={(event) => setMoneyDay(event.target.value)} /></label>
                <label>メモ（任意）<input maxLength={240} value={moneyNote} onChange={(event) => setMoneyNote(event.target.value)} /></label>
              </div>
              <button className="solid-button" type="submit" disabled={Boolean(busy)}>{busy === 'money:create' ? '保存中…' : '台帳へ追加'}</button>
            </form>
          </div>
          <div className="ledger-list">
            {operating.moneyEntries.map((entry) => (
              <article key={entry.id}>
                <span className={entry.direction}>{entry.direction === 'income' ? '収入' : '支出'}</span>
                <div><strong>{entry.category}</strong><p>{entry.note || entry.occurredAt}</p></div>
                <b>{entry.direction === 'expense' ? '−' : '＋'}{formatMoney(entry.amountMinor, entry.currency)}</b>
                <button className="icon-button" type="button" aria-label={`${entry.category}の${entry.direction === 'income' ? '収入' : '支出'}${formatMoney(entry.amountMinor, entry.currency)}を削除`} onClick={() => removeMoneyEntry(entry.id)} disabled={Boolean(busy)}>×</button>
              </article>
            ))}
          </div>
        </section>

        <section className="hub-section work-section" id="work">
          <div className="section-heading">
            <div><p className="section-index">04 / WORK</p><h2>受託から、再現できるサービスへ。</h2></div>
            <p>仕事の一手と、独立したService Cellの依頼を同じ証拠の流れへまとめます。</p>
          </div>
          <div className="work-grid">
            <article className="panel-card">
              <div className="panel-title"><div><p className="card-kicker">WORK QUEUE</p><h3>仕事の一手</h3></div><b>{operating.openWorkTaskCount}</b></div>
              {workTasks.length ? <div className="task-list compact">
                {workTasks.slice(0, 8).map((task) => (
                  <div className={task.completed ? 'completed' : ''} key={task.id}><button className="task-check" type="button" aria-label={task.completed ? `${task.title}を未完了へ戻す` : `${task.title}を完了する`} onClick={() => toggleTask(task.id, !task.completed)} disabled={Boolean(busy)}>{task.completed ? '✓' : ''}</button><div><strong>{task.title}</strong><p>{task.dueAt ?? '期限なし'}</p></div></div>
                ))}
              </div> : <div className="compact-empty"><span>NO WORK ITEMS</span><p>Todayから領域「仕事」を選んで追加できます。</p></div>}
            </article>
            <article className="panel-card work-flow">
              <p className="card-kicker">SERVICE FLOW</p><h3>一件ごとに、状態と証拠を残す。</h3>
              <ol><li><span>01</span>範囲を選ぶ</li><li><span>02</span>依頼を受付</li><li><span>03</span>Queueで実行</li><li><span>04</span>Quality gate</li><li><span>05</span>成果物とreceipt</li></ol>
              <a href="#portfolio" className="text-link">6つのサービスを見る ↘</a>
            </article>
          </div>
        </section>

        <section className="hub-section foundation-section" id="distribution">
          <div className="section-heading">
            <div><p className="section-index">05 / FOUNDATION DISTRIBUTION</p><h2>必要な資源を、ルールで配る。</h2></div>
            <p>法人成立までは設立準備運営です。申請受付と支給完了を分け、人の審査とreceiptを必須にします。</p>
          </div>

          <div className="foundation-stage-banner">
            <span>FORMATION STAGE</span>
            <div><strong>財団設立準備の配給窓口</strong><p>法人設立済み・寄付控除対象・支給確約を意味しません。現在はFirst 3000の非公開pilotです。</p></div>
            <b>{foundation.policy.version}</b>
          </div>

          <div className="foundation-balance-grid" aria-label="配給枠の現在値">
            <article><span>AVAILABLE</span><strong>{foundation.account.availableUnits}</strong><p>利用できるunit</p></article>
            <article><span>RESERVED</span><strong>{foundation.account.reservedUnits}</strong><p>用途に確保済み</p></article>
            <article><span>CONSUMED</span><strong>{foundation.account.consumedUnits}</strong><p>使用receipt確定済み</p></article>
            <article><span>SUPPLY</span><strong>{foundation.supply.globalCapacityPublished ? 'OPEN' : '未設定'}</strong><p>全体供給量は公開前</p></article>
          </div>

          <div className="foundation-layout">
            <form className="panel-card foundation-form" onSubmit={submitFoundationRequest}>
              <p className="card-kicker">NEW DISTRIBUTION REQUEST</p>
              <h3>配給を申請する</h3>
              <p className="foundation-form-intro">申請は自動承認されません。同じ種類は一件ずつ審査し、サービス・AI枠と現物支援を混ぜません。</p>
              <div className="form-grid">
                <label>種類
                  <select value={foundationKind} onChange={(event) => selectFoundationKind(event.target.value as FoundationRequestKind)}>
                    {(Object.keys(foundationKindLabels) as FoundationRequestKind[]).map((kind) => <option value={kind} key={kind}>{foundationKindLabels[kind]}</option>)}
                  </select>
                </label>
                <label>分類
                  <select value={foundationCategory} onChange={(event) => setFoundationCategory(event.target.value)}>
                    {foundationCategoryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                {foundationKind !== 'essentials_support' ? (
                  <label>希望unit
                    <input type="number" inputMode="numeric" min="1" max={foundation.policy.maxRequestedUnits} step="1" required value={foundationUnits} onChange={(event) => setFoundationUnits(event.target.value)} />
                  </label>
                ) : (
                  <div className="foundation-kind-note"><span>VENDOR DIRECT</span><p>現金ではなく、承認後に検証済み業者から必要品を直接調達する設計です。</p></div>
                )}
              </div>
              <label className="note-field">用途だけを記入
                <textarea required minLength={12} maxLength={800} value={foundationPurpose} onChange={(event) => setFoundationPurpose(event.target.value)} placeholder="何を前に進めるため、どの資源が必要か。氏名・住所・電話・メール・口座・診断名は書かないでください。" />
                <span>{foundationPurpose.length} / 800</span>
              </label>
              <label className="foundation-attestation">
                <input type="checkbox" checked={foundationAttested} onChange={(event) => setFoundationAttested(event.target.checked)} />
                <span>この配給枠に現金価値はなく、譲渡・販売・換金・返金を求めないことを確認します。</span>
              </label>
              <button className="solid-button" type="submit" disabled={Boolean(busy) || foundationPurpose.trim().length < 12 || !foundationAttested}>
                {busy === 'foundation:create' ? '受付中…' : '人の審査へ送る'}
              </button>
            </form>

            <article className="panel-card foundation-queue">
              <div className="panel-title"><div><p className="card-kicker">YOUR REQUESTS</p><h3>配給申請の状態</h3></div><b>{foundation.activeRequestCount}</b></div>
              {foundation.requests.length ? (
                <div className="foundation-request-list">
                  {foundation.requests.map((request) => {
                    const cancellable = request.status === 'requested' || request.status === 'needs_information';
                    return (
                      <article key={request.id}>
                        <div className="foundation-request-head">
                          <span data-status={request.status}>{foundationStatusLabels[request.status] ?? request.status}</span>
                          <time dateTime={request.createdAt}>{formatDateTime(request.createdAt)}</time>
                        </div>
                        <strong>{foundationKindLabels[request.kind]} / {foundationCategoryLabel(request.kind, request.category)}</strong>
                        <p>{request.purposeSummary}</p>
                        {request.decisionReason && <p className="foundation-decision">運営からの理由: {request.decisionReason}</p>}
                        <div className="foundation-request-foot">
                          <small>{request.requestedUnits > 0 ? `${request.requestedUnits} unit申請` : '必要性・品目を審査'}</small>
                          {cancellable && <button type="button" onClick={() => cancelFoundationRequest(request.id)} disabled={Boolean(busy)}>{busy === `foundation:cancel:${request.id}` ? '取消中…' : '申請を取消'}</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="compact-empty"><span>NO REQUESTS</span><p>必要な資源を一件ずつ申請できます。</p></div>}
            </article>
          </div>

          <div className="foundation-ledger-panel">
            <div><p className="card-kicker">ALLOCATION LEDGER</p><h3>配給残高のreceipt</h3><p>残高変更は上書きせず、付与・確保・使用・解除・失効・訂正を別eventとして残します。</p></div>
            {foundation.ledger.length ? (
              <div className="foundation-ledger-list">
                {foundation.ledger.map((entry) => (
                  <article key={entry.id}>
                    <span>{foundationLedgerLabels[entry.entryType] ?? entry.entryType}</span>
                    <strong>{entry.units} unit</strong>
                    <p>残高 {entry.balanceAfter}</p>
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  </article>
                ))}
              </div>
            ) : <div className="foundation-ledger-empty"><span>NO ALLOCATION EVENTS</span><p>申請受付だけでは残高は変わりません。権限を持つstewardの付与receipt後に表示されます。</p></div>}
          </div>

          <div className="foundation-policy-grid">
            <article><span>01</span><strong>非換金・非譲渡</strong><p>unitは内部のサービス供給量で、通貨・預金・ポイント・暗号資産ではありません。</p></article>
            <article><span>02</span><strong>AI単独承認なし</strong><p>AIは整理と重複確認まで。適格性、必要性、例外は権限を分けた人が判断します。</p></article>
            <article><span>03</span><strong>self-approval禁止</strong><p>申請者と承認者を同一にせず、policy versionと変更receiptを残します。</p></article>
            <article><span>04</span><strong>必需品は業者直送</strong><p>受給者への現金・gift card・cryptoではなく、購入・発送・受領を別証拠にします。</p></article>
          </div>
        </section>

        <section className="service-section" id="portfolio">
          <div className="section-heading">
            <div><p className="section-index">06 / SERVICE CELLS</p><h2>必要な仕事を、独立したサービスへ。</h2></div>
            <p>サービスを選択し、実行環境を接続して依頼します。成果物が保存されて初めて「作成完了」と表示します。</p>
          </div>
          <ExecutionDevice device={executionDevice} onChange={refreshExecutions}/>
          {executionLoadError&&<p role="status">{executionLoadError}</p>}
          <div className="service-grid">
            {serviceCells.map((cell, index) => {
              const state = slotState(cell.slotId) ?? { slotId: cell.slotId, cellId: cell.defaultCellId, enabled: false };
              const isBusy = busy === `slot:${cell.slotId}`;
              return (
                <article className={`service-card ${state.enabled ? 'enabled' : ''}`} key={cell.slotId}>
                  <div className="service-top"><span>{String(index + 1).padStart(2, '0')} / {cell.label}</span><label className="toggle"><input type="checkbox" checked={state.enabled} disabled={Boolean(busy)} onChange={(event) => updateSlot(cell.slotId, state.cellId, event.target.checked)} aria-label={`${cell.name}を選択`} /><span aria-hidden="true" /><b>{isBusy ? '保存中' : state.enabled ? '選択済み' : '未選択'}</b></label></div>
                  <p className="service-label">{cell.label}</p><h3>{cell.name}</h3><p className="service-promise">{cell.promise}</p>
                  <label className="variant-label">サービス内容<select value={state.cellId} disabled={Boolean(busy)} onChange={(event) => updateSlot(cell.slotId, event.target.value, state.enabled)}>{cell.variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name}</option>)}</select></label>
                  <ul className="deliverables">{cell.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
                  <p className="execution-meta">{state.enabled&&executionDevice.ready?'実行可能 · 本人の端末で処理':'外部サービスへの公開・送信は含みません。'}</p>
                  <button className="run-button" type="button" disabled={!state.enabled || !executionDevice.ready || Boolean(busy)} onClick={() => { setSummary(''); setFile(null); setDialog({ type: 'run', slotId: cell.slotId }); }}>{!state.enabled?'先にサービスを選択':executionDevice.ready?'依頼して成果物を作る ↗':'実行環境の接続待ち'}</button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="hub-section tinted-section" id="connections">
          <div className="section-heading">
            <div><p className="section-index">07 / CONNECTIONS</p><h2>全部の入口を、一つのHubへ。</h2></div>
            <p>ChatGPTとTelegramは、avocadomini Botで確認した短時間リンクだけで同一アカウントへ結びます。</p>
          </div>
          <div className="connection-grid">
            {connections.map((connection) => connection.id === 'telegram' ? (
              <article className="telegram-connection" key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreConnection.status === 'linked' ? 'hub' : 'core'}>
                    {coreConnection.status === 'linked' ? 'IDENTITY LINKED' : coreConnection.status === 'pending' ? 'VERIFY IN BOT' : 'CORE LINK'}
                  </span>
                  <b>TG</b>
                </div>
                <h3>avocadomini Bot</h3>
                <p>
                  {coreConnection.status === 'linked'
                    ? `@${coreConnection.botUsername}とこのHubは本人確認済みです。`
                    : coreConnection.status === 'pending'
                      ? 'リンクを発行済みです。avocadomini Botを開いてSTARTを押してください。'
                      : '自分のBotFather Botを、短時間リンクでこのHubへ接続します。'}
                </p>
                <section className="connection-actions">
                  {coreConnection.status === 'pending' && coreConnection.launchUrl ? (
                    <>
                      <a href={coreConnection.launchUrl} target="_blank" rel="noreferrer">avocadomini Botで本人確認 ↗</a>
                      <button type="button" onClick={refreshTelegramLink} disabled={Boolean(busy)}>
                        {busy === 'telegram:refresh' ? '確認中…' : '接続を再確認'}
                      </button>
                    </>
                  ) : coreConnection.status === 'linked' && corePreferences ? (
                    <div className="core-preferences">
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={corePreferences.notificationsEnabled}
                          disabled={Boolean(busy)}
                          onChange={(event) => updateCorePreferences({ notificationsEnabled: event.target.checked })}
                          aria-label="Telegram通知"
                        />
                        <span aria-hidden="true" /><b>通知 {corePreferences.notificationsEnabled ? 'ON' : 'OFF'}</b>
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={corePreferences.dailyAutomationEnabled}
                          disabled={Boolean(busy)}
                          onChange={(event) => updateCorePreferences({ dailyAutomationEnabled: event.target.checked })}
                          aria-label="日次自動化"
                        />
                        <span aria-hidden="true" /><b>日次 {corePreferences.dailyAutomationEnabled ? 'ON' : 'OFF'}</b>
                      </label>
                      <label className="core-time-zone">
                        タイムゾーン
                        <select
                          value={corePreferences.timeZone}
                          disabled={Boolean(busy)}
                          onChange={(event) => updateCorePreferences({ timeZone: event.target.value })}
                        >
                          <option value="America/New_York">America/New_York</option>
                          <option value="Asia/Tokyo">Asia/Tokyo</option>
                          <option value="UTC">UTC</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <button type="button" onClick={beginTelegramLink} disabled={Boolean(busy)}>
                      {busy === 'telegram:link' ? '発行中…' : coreConnection.status === 'unavailable' ? 'Coreを再確認' : 'Telegram本人リンクを作る'}
                    </button>
                  )}
                </section>
                {coreConnection.status === 'linked' ? (
                  <section className="timing-core-panel" aria-label="Timing Coreの状態">
                    <div>
                      <span>TIMING CORE</span>
                      <strong>{coreTiming.status === 'ready' ? 'READY' : 'CHECK'}</strong>
                    </div>
                    <dl>
                      <div><dt>COMMAND LEDGER</dt><dd>{coreTiming.commandLedger.ready ? '稼働中' : '確認待ち'}</dd></div>
                      <div><dt>CALENDAR</dt><dd>{coreTiming.calendar.status === 'connected' ? '接続済み' : coreTiming.calendar.configured ? '本人接続待ち' : '未設定'}</dd></div>
                      <div><dt>BUSY WINDOWS</dt><dd>{coreTiming.calendar.busyIntervalCount}件</dd></div>
                      <div><dt>NOTIFICATIONS</dt><dd>{coreTiming.notifications.pendingCount}件待機</dd></div>
                    </dl>
                    <p>
                      {coreTiming.calendar.status === 'connected'
                        ? 'Calendarのbusy時間をCoreで確認できます。'
                        : 'Google/Composioの所有確認が終わるまで、予定取得と移動時間推定は安全停止します。'}
                    </p>
                    <button type="button" onClick={refreshCoreTiming} disabled={Boolean(busy)}>
                      {busy === 'timing:refresh' ? '確認中…' : 'Timing状態を再確認'}
                    </button>
                    {coreTiming.calendar.configured ? (
                      <button type="button" onClick={syncCoreCalendar} disabled={Boolean(busy)}>
                        {busy === 'calendar:sync' ? '同期中…' : 'Google Calendarを同期'}
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </article>
            ) : connection.id === 'gmail' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreMail.status === 'connected' ? 'hub' : 'core'}>
                    {coreMail.status === 'connected'
                      ? 'MAIL LINKED'
                      : coreConnection.status === 'linked' ? 'OWNER READY' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>GM</b>
                </div>
                <h3>Gmail</h3>
                <p>
                  {coreMail.status === 'connected'
                    ? 'このHubと同じ本人のGoogleメール接続をCoreで確認済みです。'
                    : coreConnection.status === 'linked'
                    ? coreMail.configured
                      ? 'Googleの本人確認を通し、確認済みメールだけをavocadominiへ接続します。'
                      : 'Gmail providerの本人設定が終わるまで安全停止します。'
                    : '先にavocadomini BotとこのHubの本人リンクを完了してください。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={beginGmailLink}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked' || coreMail.status === 'connected'}
                  >
                    {busy === 'mail:connect'
                      ? '接続準備中…'
                      : coreMail.status === 'connected' ? 'Gmail本人接続済み' : 'Gmailを本人接続'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshMailRail}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'mail-rail:refresh' ? '照合中…' : '本人所有メールを照合'}
                  </button>
                </section>
                <p>
                  {coreMailRail.status === 'verified'
                    ? `${coreMailRail.sendingDomain}から送信し、${coreMailRail.replyDomain}で署名返信を受信できます。`
                    : coreMailRail.configured
                      ? 'Resendのドメイン・受信・Webhookを再照合してください。'
                      : '本人所有ドメインとResend専用credentialの設定待ちです。'}
                </p>
                <div className="form-grid">
                  <label>宛先<input type="email" value={mailRecipient} onChange={(event) => setMailRecipient(event.target.value)} /></label>
                  <label>件名<input type="text" maxLength={200} value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} /></label>
                  <label>本文<textarea maxLength={8192} value={mailBody} onChange={(event) => setMailBody(event.target.value)} /></label>
                </div>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={sendOwnedMail}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked' || coreMailRail.status !== 'verified'}
                  >
                    {busy === 'mail-rail:send' ? '送信中…' : '確認して1通送信'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'stripe' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreBilling.status === 'active' ? 'hub' : 'core'}>
                    {coreBilling.status === 'active'
                      ? 'LEGACY SERVICE ACTIVE'
                      : coreConnection.status === 'linked' ? 'OWNER READY' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>ST</b>
                </div>
                <h3>既存サービスのStripe契約</h3>
                <p>この決済は新しい月額8.88米ドルのプランとは別です。新プランの課金はまだ開始していません。購入前に決済画面の対象サービス・金額・契約条件を確認してください。</p>
                <p>
                  {coreBilling.status === 'active'
                    ? `既存サービスの利用状態は有効です${coreBilling.planStatus ? `（${coreBilling.planStatus}）` : ''}。`
                    : coreBilling.configured
                      ? '本人専用の短期参照を付けたPayment Linkを発行します。配給や寄付には使用しません。'
                      : 'Kai所有StripeのPayment Linkと署名Webhookが揃うまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={beginStripeCheckout}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked' || coreBilling.status === 'active'}
                  >
                    {busy === 'billing:checkout'
                      ? '決済準備中…'
                      : coreBilling.status === 'active' ? '既存サービス利用中' : '既存サービスの購入画面を開く'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'gemini' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreAi.status === 'verified' ? 'hub' : 'core'}>
                    {coreAi.status === 'verified'
                      ? 'MODEL VERIFIED'
                      : coreConnection.status === 'linked' ? 'OWNER CHECK' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>AI</b>
                </div>
                <h3>Google Gemini</h3>
                <p>
                  {coreAi.status === 'verified'
                    ? `${coreAi.model}をGoogle APIからreadback済みです。現在はモデル確認のみで、生成と課金は無効です。`
                    : coreAi.configured
                      ? '専用Gemini credentialと固定モデルをGoogle APIから読み取り確認します。'
                      : 'Kai所有Geminiの専用credentialを設定するまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={refreshCoreAi}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'ai:refresh' ? '確認中…' : 'Gemini credentialを再確認'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'location' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreMaps.credentialVerified ? 'hub' : 'core'}>
                    {coreMaps.credentialVerified
                      ? 'ROUTES VERIFIED'
                      : coreMaps.configured ? 'READY TO VERIFY' : 'OWNER KEY REQUIRED'}
                  </span>
                  <b>MP</b>
                </div>
                <h3>Location・Maps</h3>
                <p>
                  {coreMaps.credentialVerified
                    ? 'Maps専用credentialによるGoogle Routes APIの成功receiptがあります。座標は保存しません。'
                    : coreMaps.configured
                      ? '座標を一回の経路計算にだけ使用し、D1には所要時間・距離とHMAC receiptだけを残します。'
                      : 'Geminiとは別のMaps専用credentialを設定するまで安全停止します。'}
                </p>
                <div className="form-grid">
                  <label>出発地 緯度<input type="number" step="any" value={routeOriginLatitude} onChange={(event) => setRouteOriginLatitude(event.target.value)} /></label>
                  <label>出発地 経度<input type="number" step="any" value={routeOriginLongitude} onChange={(event) => setRouteOriginLongitude(event.target.value)} /></label>
                  <label>目的地 緯度<input type="number" step="any" value={routeDestinationLatitude} onChange={(event) => setRouteDestinationLatitude(event.target.value)} /></label>
                  <label>目的地 経度<input type="number" step="any" value={routeDestinationLongitude} onChange={(event) => setRouteDestinationLongitude(event.target.value)} /></label>
                  <label>移動手段<select value={routeTravelMode} onChange={(event) => setRouteTravelMode(event.target.value as typeof routeTravelMode)}><option value="DRIVE">車</option><option value="WALK">徒歩</option><option value="BICYCLE">自転車</option><option value="TRANSIT">公共交通</option></select></label>
                </div>
                {routeResult ? <p>結果: 約{Math.ceil(routeResult.durationSeconds / 60)}分 / {(routeResult.distanceMeters / 1000).toFixed(1)}km{routeResult.cached ? '（再試行receipt）' : ''}</p> : null}
                <section className="connection-actions">
                  <button type="button" onClick={refreshCoreMaps} disabled={Boolean(busy) || coreConnection.status !== 'linked'}>{busy === 'maps:refresh' ? '確認中…' : 'Maps状態を再確認'}</button>
                  <button type="button" onClick={computePrivateRoute} disabled={Boolean(busy) || coreConnection.status !== 'linked' || !coreMaps.configured}>{busy === 'maps:compute' ? '計算中…' : '確認して経路計算'}</button>
                </section>
              </article>
            ) : connection.id === 'voice' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreVoice.status === 'verified' ? 'hub' : 'core'}>
                    {coreVoice.status === 'verified'
                      ? 'SIGNED INBOUND READY'
                      : coreConnection.status === 'linked' ? 'OWNER CHECK' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>VO</b>
                </div>
                <h3>Voice・Call</h3>
                <p>
                  {coreVoice.status === 'verified'
                    ? 'Kai所有Telnyxの番号・Call Control application・Webhook v2・署名受信を照合済みです。発信はまだ無効です。'
                    : coreVoice.status === 'mismatch'
                      ? 'Telnyxから読み取った番号・接続先・Webhookのいずれかが設計値と一致しません。'
                      : coreVoice.configured
                        ? 'Kai所有Telnyxを読み取り照合します。確認中も発信は行いません。'
                        : 'Telnyx API key、番号、接続先、公開鍵が揃うまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={refreshCoreVoice}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'voice:refresh' ? '照合中…' : 'Telnyx所有状態を再確認'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'social' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreSocial.status === 'verified' ? 'hub' : 'core'}>
                    {coreSocial.status === 'verified'
                      ? 'OWNER CHANNELS VERIFIED'
                      : coreConnection.status === 'linked' ? 'OWNER CHECK' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>SN</b>
                </div>
                <h3>SNS・Postiz</h3>
                <p>
                  {coreSocial.status === 'verified'
                    ? `Postizから${coreSocial.integrations.map((item) => `${item.identifier}: @${item.profile}`).join(' / ')}を本人所有として照合済みです。投稿はまだ無効です。`
                    : coreSocial.status === 'mismatch'
                      ? 'Postizのintegration ID・サービス種別・公開プロフィールのいずれかが設計値と一致しません。'
                      : coreSocial.configured
                        ? 'Kai所有Postizを読み取り照合します。確認中も投稿は行いません。'
                        : 'Postiz API keyと本人所有integration一覧が揃うまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={refreshCoreSocial}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'social:refresh' ? '照合中…' : 'Postiz所有SNSを再確認'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'vendor-bank' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreVendorBank.status === 'verified' ? 'hub' : 'core'}>
                    {coreVendorBank.status === 'verified'
                      ? 'OWNER ACCOUNT VERIFIED'
                      : coreConnection.status === 'linked' ? 'OWNER CHECK' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>BK</b>
                </div>
                <h3>業者振込・GMOあおぞら</h3>
                <p>
                  {coreVendorBank.status === 'verified'
                    ? `本人法人口座を${coreVendorBank.environment === 'production' ? '本番' : '検証'}APIから照合済みです。口座情報は画面へ返さず、振込実行は無効です。`
                    : coreVendorBank.status === 'mismatch'
                      ? '銀行APIは読めましたが、指定口座・円普通預金の条件が一致しません。'
                      : coreVendorBank.configured
                        ? '本人法人口座を読み取り照合します。残高照会や振込は行いません。'
                        : 'GMOあおぞら法人口座のAPI tokenと口座IDが揃うまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={refreshCoreVendorBank}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'vendor-bank:refresh' ? '照合中…' : '本人法人口座を再確認'}
                  </button>
                </section>
              </article>
            ) : connection.id === 'browser' ? (
              <article key={connection.id}>
                <div className="connection-card-head">
                  <span className={coreBrowser.status === 'verified' ? 'hub' : 'core'}>
                    {coreBrowser.status === 'verified'
                      ? 'OWNER TOKEN VERIFIED'
                      : coreConnection.status === 'linked' ? 'OWNER CHECK' : 'LINK MR. BOT FIRST'}
                  </span>
                  <b>BR</b>
                </div>
                <h3>Cloudflare Browser</h3>
                <p>
                  {coreBrowser.status === 'verified'
                    ? `本人Cloudflare accountとBrowser Rendering専用tokenを照合済みです。${coreBrowser.activeSessionPresent ? '既存active sessionがあります。' : 'active sessionはありません。'}新しいsessionは起動しません。`
                    : coreBrowser.configured
                      ? 'Browser Renderingのsession一覧をGETし、accountとtokenの一致だけを確認します。'
                      : 'Browser Rendering Read権限の専用tokenを設定するまで安全停止します。'}
                </p>
                <section className="connection-actions">
                  <button
                    type="button"
                    onClick={refreshCoreBrowser}
                    disabled={Boolean(busy) || coreConnection.status !== 'linked'}
                  >
                    {busy === 'browser:refresh' ? '照合中…' : 'Cloudflare Browserを再確認'}
                  </button>
                </section>
              </article>
            ) : (
              <article key={connection.id}>
                <div><span className={connection.status}>{connection.status === 'hub' ? 'HUB LIVE' : 'CORE LINK'}</span><b>{connection.id.slice(0, 2).toUpperCase()}</b></div>
                <h3>{connection.name}</h3><p>{connection.description}</p>
                <a href={connection.href} target={connection.href.startsWith('http') ? '_blank' : undefined} rel={connection.href.startsWith('http') ? 'noreferrer' : undefined}>{connection.action} ↗</a>
              </article>
            ))}
          </div>
          <div className="ai-package-heading">
            <div>
              <p className="card-kicker">AI TOOL PACKAGE BRIDGE</p>
              <h3>外部AIを、権限が見えるパッケージへ。</h3>
            </div>
            <p>公式MCP Registry形式を受け取り、権限・effect・提供者審査・digestを別々に確認します。現在はカタログ生成までで、インストール・認証・外部実行・課金は接続していません。</p>
          </div>
          <div className="ai-package-status">
            <div><span>CATALOG</span><strong>{aiToolCatalog.packages.length}</strong><small>表示中</small></div>
            <div><span>EXECUTION</span><strong>OFF</strong><small>実行未接続</small></div>
            <div className="ai-package-formats"><span>FORMATS</span><p>{aiToolCatalog.supportedPackageTypes.map((format) => <b key={format}>{format}</b>)}</p></div>
          </div>
          <div className="ai-package-grid">
            {aiToolCatalog.packages.map((toolPackage) => (
              <article key={toolPackage.id}>
                <div className="ai-package-badges">
                  <span data-tone="valid">形式検証済み</span>
                  <span data-tone="warning">{toolPackage.publisherTrust === 'metadata_reviewed' ? '提供者metadata確認済み' : '提供元未確認'}</span>
                  <span>カタログのみ</span>
                </div>
                <p className="card-kicker">{toolPackage.entryKind === 'template' ? 'TEMPLATE' : toolPackage.kind.replace('_', ' ')} · {toolPackage.packageFormat}</p>
                <h3>{toolPackage.title}</h3>
                <p className="ai-package-description">{toolPackage.description}</p>
                <dl>
                  <div><dt>Publisher</dt><dd>{toolPackage.publisherName}</dd></div>
                  <div><dt>Version</dt><dd>{toolPackage.version}</dd></div>
                  <div><dt>Digest</dt><dd>{toolPackage.manifestSha256.slice(0, 12)}…</dd></div>
                </dl>
                <div className="ai-capability-list">
                  {toolPackage.capabilities.map((capability) => (
                    <div key={capability.id}>
                      <span data-effect={capability.effect}>{aiToolEffectLabels[capability.effect]}</span>
                      <p><strong>{capability.title}</strong><small>{capability.ownerApproval === 'per_invocation' ? '毎回承認' : '導入時承認'}</small></p>
                    </div>
                  ))}
                </div>
                <p className="ai-package-boundary">表示は接続成功や安全認定を意味しません。外部へは何も送信しません。</p>
              </article>
            ))}
          </div>
          <div className="capability-heading"><p className="card-kicker">FULL CAPABILITY MAP</p><h3>機能の現在地</h3></div>
          <div className="capability-grid">
            {capabilityGroups.map((group) => (
              <article className="capability-card" key={group.id}>
                <p className="card-kicker">{group.label}</p><h3>{group.name}</h3><p>{group.description}</p>
                <ul>{group.capabilities.map((capability) => (
                  <li key={capability.id}><span title={capability.description}>{capability.name}</span><b data-status={capability.status}>{capability.status === 'hub' ? 'Hub' : capability.status === 'core' ? 'Core' : '計画'}</b></li>
                ))}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className="activity-section" id="proof">
          <div className="section-heading activity-heading">
            <div><p className="section-index">08 / PROOF + ACTIVITY</p><h2>動いた事実を、後から確かめる。</h2></div>
            <button type="button" className="reset-button" onClick={resetEverything} disabled={Boolean(busy)}>Service Cellを初期状態に戻す</button>
          </div>
          <div className="proof-grid">
            <div>
              <p className="card-kicker">SERVICE RUNS</p>
              {snapshot.runs.length ? <div className="activity-list">
                {snapshot.runs.map((run) => {
                  const cell = serviceCells.find((item) => item.slotId === run.slotId);
                  const execution=run.execution;
                  const label=!execution?'保存のみ・未実行':({queued:'実行待ち',running:'処理中',completed:'作成完了',failed:'失敗',cancelled:'取消済み'}[run.status]||run.status);
                  return <article className="execution-run" key={run.id}><div className="execution-run-heading"><span className="activity-status">{label}</span><strong>{cell?.name ?? run.cellId}</strong><time dateTime={run.createdAt}>{formatDateTime(run.createdAt)}</time></div><p>{run.summary}</p>
                    {execution?.result&&<details open><summary>{execution.result.title}</summary><pre className="execution-result">{execution.result.body}</pre><h4>確認したこと</h4><ul>{execution.result.checks.map((value,i)=><li key={i}>{value}</li>)}</ul><h4>注意・未確認</h4><ul>{execution.result.warnings.map((value,i)=><li key={i}>{value}</li>)}</ul><button type="button" onClick={()=>copyResult(execution.result!)}>成果物をコピー</button><p className="execution-meta">作成完了は公開・外部納品・売上発生を意味しません。</p></details>}
                    {execution?.errorCode&&<p role="status">処理できませんでした（{execution.errorCode}）。接続状態と入力を確認し、必要なら新しく依頼してください。</p>}
                    {execution&&['queued','running'].includes(run.status)&&<button type="button" onClick={()=>cancelRun(run.id)}>この依頼を取り消す</button>}
                    {['failed','cancelled'].includes(run.status)&&<button type="button" disabled={!executionDevice.ready} onClick={()=>{setSummary(run.summary);setFile(null);setDialog({type:'run',slotId:run.slotId});}}>内容を確認して再依頼</button>}
                  </article>;
                })}
              </div> : <div className="empty-activity"><span>NO RUNS YET</span><p>Service Cellへ依頼すると受付履歴が残ります。</p></div>}
            </div>
            <div>
              <p className="card-kicker">AUDIT TRAIL</p>
              {operating.auditEvents.length ? <div className="audit-list">{operating.auditEvents.map((event) => <article key={event.id}><span>LOG</span><strong>{auditLabels[event.action] ?? event.action}</strong><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></article>)}</div> : <div className="empty-activity"><span>NO AUDIT EVENTS</span><p>設定や記録を変更すると監査履歴が残ります。</p></div>}
            </div>
          </div>
          <div className="data-controls">
            <div><p className="card-kicker">YOUR DATA</p><h3>持ち出せる。削除できる。</h3><p>このHubが保存した配給申請・配給台帳を含むJSONデータを書き出せます。削除処理はD1と確認できたR2添付を対象にします。現在は非公開pilotで、クラッシュ後の遅延uploadを確実に回収するdurable reaperは公開前の実装項目です。ChatGPT側のアカウント削除とは別です。</p><p className="storage-health" data-status={initialStorageHealth.status}>FILES {initialStorageHealth.status === 'ready' ? '接続済み' : '安全停止'}</p></div>
            <div><a className="data-button" href="/api/data">JSONを書き出す</a><button className="danger-button" type="button" onClick={eraseHubData} disabled={Boolean(busy)}>{busy === 'data:erase' ? '削除中…' : 'Hub保存データを削除'}</button></div>
          </div>
        </section>

        <footer><span>AVOCADOMINI / OWNER HUB</span><span>PORTFOLIO {snapshot.portfolioId}</span></footer>
      </section>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション" inert={dialog ? true : undefined}><a href="#overview"><span>⌂</span>ホーム</a><a href="#today"><span>✓</span>今日</a><a href="#wellbeing"><span>◉</span>状態</a><a href="#money"><span>¥</span>お金</a><a href="#distribution"><span>◇</span>配給</a><a href="#portfolio"><span>↗</span>サービス</a></nav>

      {dialog?.type === 'connect' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setDialog(null); }}>
          <section ref={dialogRef} className="modal connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" tabIndex={-1}>
            <div className="modal-head"><div><p className="section-index">REVIEW / SELECT SERVICES</p><h2 id="connect-title">使う6サービスを選択</h2></div><button type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)} aria-label="閉じる">×</button></div>
            <p className="modal-intro">この操作はサービスの選択を保存します。実行には、本人の端末を接続して「実行可能」になってから個別に依頼してください。</p>
            <div className="review-list">
              {serviceCells.map((cell, index) => {
                const state = slotState(cell.slotId);
                const variant = cell.variants.find((item) => item.id === state?.cellId) ?? cell.variants[0];
                return <div key={cell.slotId}><span>{String(index + 1).padStart(2, '0')}</span><strong>{cell.label}</strong><p>{variant.name}</p><b>{state?.enabled ? '選択済み' : '選択する'}</b></div>;
              })}
            </div>
            <button className="confirm-button" type="button" onClick={connectEverything} disabled={Boolean(busy)}>{busy === 'connect' ? '保存しています…' : 'この6サービスを選択する'}</button>
          </section>
        </div>
      )}

      {dialog?.type === 'run' && selectedRunCell && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setDialog(null); }}>
          <section ref={dialogRef} className="modal run-modal" role="dialog" aria-modal="true" aria-labelledby="run-title" tabIndex={-1}>
            <div className="modal-head"><div><p className="section-index">{selectedRunCell.label} / NEW RUN</p><h2 id="run-title">{selectedRunCell.name}を使う</h2></div><button type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)} aria-label="閉じる">×</button></div>
            <form onSubmit={submitRun}>
              <label>何を完成させたいですか？<textarea autoFocus required minLength={3} maxLength={5000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="目的、対象者、必要な内容、期限などを書いてください。" /><span>{summary.length} / 5,000</span></label>
              <label className="file-field">参考テキスト（任意・64KB / 16,000文字まで）<input type="file" accept=".txt,.md,.json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
              <p className="run-note">依頼文と添付テキストを本人の接続端末とCodexへ送り、AIで成果物を作成します。画像・PDF・URL先は読みません。1時間10件・同時受付3件まで。Codexの利用枠を使用します。</p>
              <button className="confirm-button" type="submit" disabled={!executionDevice.ready || Boolean(busy) || summary.trim().length < 3}>{busy?.startsWith('run:') ? '受付しています…' : 'この内容を送って実行する'}</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
