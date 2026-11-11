import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config, hasCredentials } from './config.js';
import { buildServer } from './server.js';

const main = async () => {
  if (!hasCredentials()) {
    console.error('KaryaOS MCP: set KARYA_TOKEN, or KARYA_EMAIL and KARYA_PASSWORD. Tools will answer with a sign-in error until then.');
  }
  console.error(`KaryaOS MCP: ${config.allowWrites ? 'writes ON (approve, send back)' : 'read-only'}, API ${config.apiUrl}, at most ${config.maxRows} rows per answer.`);
  await buildServer().connect(new StdioServerTransport());
};

main().catch((err: unknown) => {
  console.error('KaryaOS MCP failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
