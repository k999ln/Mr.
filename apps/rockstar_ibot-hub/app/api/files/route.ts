import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../lib/api-guard';
import { completeFileUpload, reserveFileUpload } from '../../lib/portfolio-store';
import { OperatingLockedError } from '../../lib/operating-store';
import { mutationKey, operatingErrorResponse } from '../../lib/operating-response';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 512 * 1024;
const ALLOWED_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function safeFilename(value: string): string {
  const normalized = value.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim();
  return (normalized || 'attachment').slice(0, 120);
}

async function sha256(value: ArrayBuffer): Promise<{ bytes: ArrayBuffer; hex: string }> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return {
    bytes: digest,
    hex: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}

function uploadedObjectMatches(
  object: R2Object | null,
  input: { fileId: string; byteSize: number; contentSha256: string; writeFence: number },
): boolean {
  return Boolean(
    object &&
      object.size === input.byteSize &&
      object.customMetadata?.fileId === input.fileId &&
      object.customMetadata?.writeFence === String(input.writeFence) &&
      object.customMetadata?.contentSha256 === input.contentSha256,
  );
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  if (!env.FILES) {
    return NextResponse.json({ error: 'ファイル保存先に接続できません。' }, { status: 503 });
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json({ error: '添付は10MB以下にしてください。' }, { status: 413 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '添付ファイルを選んでください。' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: '添付は10MB以下にしてください。' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'PDF、テキスト、JSON、PNG、JPEG、WebPのみ添付できます。' },
        { status: 400 },
      );
    }
    const filename = safeFilename(file.name);
    const bytes = await file.arrayBuffer();
    const digest = await sha256(bytes);
    const reservation = await reserveFileUpload({
      ownerId: auth.user.userId,
      writeFence: auth.writeFence,
      mutationKey: mutationKey(request),
      filename,
      contentType: file.type,
      byteSize: file.size,
      contentSha256: digest.hex,
    });
    const currentObject = await env.FILES.head(reservation.objectKey);
    if (
      !uploadedObjectMatches(currentObject, {
        fileId: reservation.id,
        byteSize: reservation.byteSize,
        contentSha256: digest.hex,
        writeFence: auth.writeFence,
      })
    ) {
      const storedObject = await env.FILES.put(reservation.objectKey, bytes, {
        sha256: digest.bytes,
        httpMetadata: { contentType: file.type },
        customMetadata: {
          ownerId: auth.user.userId,
          fileId: reservation.id,
          contentSha256: digest.hex,
          writeFence: String(auth.writeFence),
        },
      });
      if (!storedObject) throw new Error('添付ファイルを保存できませんでした。');
    }
    let completed: boolean;
    try {
      completed = await completeFileUpload(
        auth.user.userId,
        auth.writeFence,
        reservation.id,
      );
    } catch (error) {
      if (error instanceof OperatingLockedError) {
        await env.FILES.delete(reservation.objectKey);
      }
      throw error;
    }
    if (!completed) {
      await env.FILES.delete(reservation.objectKey);
      throw new OperatingLockedError('データ状態が更新されたため添付を完了できませんでした。');
    }
    return NextResponse.json({
      fileId: reservation.id,
      filename: reservation.filename,
      size: reservation.byteSize,
    });
  } catch (error) {
    return operatingErrorResponse(error, '添付ファイルを保存できませんでした。', 'file-upload');
  }
}
