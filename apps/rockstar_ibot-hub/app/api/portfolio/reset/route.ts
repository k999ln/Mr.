import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { mutationKey, operatingErrorResponse } from '../../../lib/operating-response';
import { resetPortfolio } from '../../../lib/portfolio-store';

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json(
      await resetPortfolio(auth.user.userId, auth.writeFence, mutationKey(request)),
    );
  } catch (error) {
    return operatingErrorResponse(error, '初期状態に戻せませんでした。', 'portfolio-reset');
  }
}
