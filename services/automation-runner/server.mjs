import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { tools, servicePlan, buildCoconalaDraft } from '../../packages/automation-hub/index.mjs';

export const MAX_INPUT_BYTES = 64 * 1024;

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function parseDraft(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw new RequestError(413, 'input_too_large');
  let input;
  try { input = JSON.parse(text); }
  catch { throw new RequestError(400, 'invalid_json'); }
  try { return buildCoconalaDraft(input); }
  catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new RequestError(400, 'invalid_input');
    throw error;
  }
}

export async function readInput(stream) {
  let total = 0;
  const chunks = [];
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_INPUT_BYTES) throw new RequestError(413, 'input_too_large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readRequest(req) {
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_INPUT_BYTES)) {
    throw new RequestError(413, 'input_too_large');
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    let settled = false;
    const chunks = [];
    const fail = (code, status = 400) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(new RequestError(status, code));
    };
    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        fail('input_too_large', 413);
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8');
      chunks.length = 0;
      resolve(text);
    });
    req.on('error', () => fail('incomplete_request'));
    req.on('aborted', () => fail('incomplete_request'));
  });
}

function reply(res, status, payload) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Connection': 'close',
  });
  res.end(JSON.stringify(payload) + '\n');
}

/** Built-in pure functions only: no package loading, shell, outbound requests, or billing. */
export async function startRunner({ token, host = '127.0.0.1', port = 8888 } = {}) {
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('loopback_host_required');
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) throw new Error('MR_RUNNER_TOKEN_must_be_32_random_bytes_as_hex');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid_port');
  const digest = (value) => createHash('sha256').update(value).digest();
  const expectedAuth = digest('Bearer ' + token);
  let origin;
  let authority;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, async (req, res) => {
    try {
      if (req.headers.host !== authority) throw new RequestError(403, 'invalid_host');
      if (req.headers.origin !== undefined && req.headers.origin !== origin) throw new RequestError(403, 'cross_origin_denied');
      if (req.headers['sec-fetch-site'] !== undefined && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) {
        throw new RequestError(403, 'cross_origin_denied');
      }
      if (!timingSafeEqual(digest(req.headers.authorization || ''), expectedAuth)) throw new RequestError(401, 'unauthorized');
      if (req.url === '/health' && req.method === 'GET') {
        reply(res, 200, { status: 'ok', service: 'mr-automation-runner', mode: 'local_draft_only' });
      } else if (req.url === '/v1/tools' && req.method === 'GET') {
        reply(res, 200, { tools, servicePlan });
      } else if (req.url === '/v1/drafts/coconala' && req.method === 'POST') {
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) {
          throw new RequestError(415, 'json_required');
        }
        reply(res, 200, parseDraft(await readRequest(req)));
      } else {
        throw new RequestError(404, 'not_found');
      }
    } catch (error) {
      reply(res, error instanceof RequestError ? error.status : 500, {
        error: error instanceof RequestError ? error.code : 'internal_error',
      });
    }
  });
  server.maxRequestsPerSocket = 1;
  server.setTimeout(10000, (socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => {
      const address = server.address();
      authority = `${host === '::1' ? '[::1]' : host}:${address.port}`;
      origin = `http://${authority}`;
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    server,
    origin,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
