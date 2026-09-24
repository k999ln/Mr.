import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { mutationKey, operatingErrorResponse } from '../../../lib/operating-response';
import { connectAll } from '../../../lib/portfolio-store';

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json(
      await connectAll(auth.user.userId, auth.writeFence, mutationKey(request)),
    );
  } catch (error) {
    return operatingErrorResponse(error, '全体連携を保存できませんでした。', 'connect-all');
  }
}
