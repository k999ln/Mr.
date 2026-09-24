import { NextResponse } from 'next/server';
import { boundedJson,executionStore,executionErrorResponse } from '../../../lib/execution';
import { ExecutionError } from '../../../lib/execution-store.mjs';

export async function POST(request:Request) {
  // Dedicated device credential. Never accept a browser cookie or forwarded user header here.
  if(request.headers.has('origin'))return NextResponse.json({error:'Browser origin is not allowed.'},{status:403});
  try{
    const store=executionStore();
    const actor=await store.authenticate(request.headers.get('authorization')?.replace(/^Bearer /,'')||'');
    const body=await boundedJson(request);
    let result:unknown;
    if(body.action==='heartbeat'&&typeof body.verified==='boolean'&&typeof body.protocol==='string')result=await store.heartbeat(actor,body.verified,body.protocol);
    else if(body.action==='claim')result={job:await store.claim(actor)};
    else if(body.action==='complete')result=await store.complete(actor,body);
    else throw new ExecutionError('invalid_request',400);
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return executionErrorResponse(error);}
}
