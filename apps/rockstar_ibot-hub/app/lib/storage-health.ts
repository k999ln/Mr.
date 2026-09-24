export type StorageHealthSnapshot = {
  status: 'ready' | 'unavailable';
  checkedAt: string;
};

type R2ReadProbe = {
  head(key: string): Promise<unknown>;
};

const BINDING_PROBE_KEY = '__mrbot_health__/binding-probe';

export async function readStorageHealth(
  bucket: R2ReadProbe | null | undefined,
  now = () => new Date(),
): Promise<StorageHealthSnapshot> {
  const checkedAt = now().toISOString();
  if (!bucket) return { status: 'unavailable', checkedAt };

  try {
    await bucket.head(BINDING_PROBE_KEY);
    console.info('[storage-health:r2] ready');
    return { status: 'ready', checkedAt };
  } catch {
    console.error('[storage-health:r2] unavailable');
    return { status: 'unavailable', checkedAt };
  }
}
