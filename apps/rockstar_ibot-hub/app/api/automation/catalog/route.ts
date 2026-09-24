import { NextResponse } from 'next/server';
import { tools, servicePlan } from '../../../generated/automation-hub/index.mjs';

export function GET() {
  // Public product metadata only. No connection credentials or user state.
  return NextResponse.json({ schemaVersion: 1, tools, servicePlan });
}
