import { NextResponse } from 'next/server';
import {
  OperatingConflictError,
  OperatingInputError,
  OperatingLimitError,
  OperatingLockedError,
} from './operating-store';

export function mutationKey(request: Request): string {
  return request.headers.get('idempotency-key') ?? '';
}

export async function jsonRecord(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new OperatingInputError('JSONオブジェクトを送信してください。');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OperatingInputError) throw error;
    throw new OperatingInputError('JSONの形式が正しくありません。');
  }
}

export function operatingErrorResponse(
  error: unknown,
  fallbackMessage: string,
  context: string,
): NextResponse {
  if (error instanceof OperatingInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof OperatingConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof OperatingLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }
  if (error instanceof OperatingLockedError) {
    return NextResponse.json({ error: error.message }, { status: 423 });
  }
  console.error(`[operating:${context}]`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
