import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { withToken } from './api.js';
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const rpcError = (res: ServerResponse, status: number, message: string) =>
  send(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null });

const bearer = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const readJson = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });

const http = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  if (path !== '/mcp') return send(res, 404, { message: 'Not found' });
  if (req.method !== 'POST') return rpcError(res, 405, 'Use POST.');

  const token = bearer(req);
  if (!token) return rpcError(res, 401, 'Send your KaryaOS access token as a Bearer token.');

  void (async () => {
    try {
      const body = await readJson(req);
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await withToken(token, () => transport.handleRequest(req, res, body));
    } catch (err) {
      if (!res.headersSent) rpcError(res, 400, err instanceof Error && err.message === 'too large' ? 'Request too large.' : 'Bad request.');
    }
  })();
});

http.listen(PORT, HOST, () => {
  console.error(`KaryaOS MCP (HTTP): http://${HOST}:${PORT}/mcp, one KaryaOS token per request, nothing stored.`);
});
