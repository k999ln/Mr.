import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { createTask, deleteTask, setTaskCompleted } from '../../../lib/operating-store';
import {
  jsonRecord,
  mutationKey,
  operatingErrorResponse,
} from '../../../lib/operating-response';

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (typeof body.domain !== 'string' || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'タスク内容が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await createTask(
        auth.user.userId,
        auth.writeFence,
        body.domain,
        body.title,
        typeof body.dueAt === 'string' ? body.dueAt : undefined,
        mutationKey(request),
      ),
    );
  } catch (error) {
    return operatingErrorResponse(error, 'タスクを保存できませんでした。', 'task-create');
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (typeof body.taskId !== 'string' || typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'タスクの状態が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await setTaskCompleted(auth.user.userId, auth.writeFence, body.taskId, body.completed),
    );
  } catch (error) {
    return operatingErrorResponse(error, 'タスクを更新できませんでした。', 'task-update');
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (typeof body.taskId !== 'string') {
      return NextResponse.json({ error: 'タスクが正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(await deleteTask(auth.user.userId, auth.writeFence, body.taskId));
  } catch (error) {
    return operatingErrorResponse(error, 'タスクを削除できませんでした。', 'task-delete');
  }
}
