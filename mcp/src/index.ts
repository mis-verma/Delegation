import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config, hasCredentials } from './config.js';
import { registerTools } from './tools.js';

const server = new McpServer(
  { name: 'karyaos', version: '0.1.0' },
  {
    instructions:
      'Read-only access to KaryaOS as one signed-in person. Every answer is limited to what that person is allowed to see. Counts are for the current organisation day.',
  },
);

registerTools(server);

const main = async () => {
  if (!hasCredentials()) {
    console.error('KaryaOS MCP: set KARYA_TOKEN, or KARYA_EMAIL and KARYA_PASSWORD. Tools will answer with a sign-in error until then.');
  }
  console.error(`KaryaOS MCP: read-only, API ${config.apiUrl}, at most ${config.maxRows} rows per answer.`);
  await server.connect(new StdioServerTransport());
};

main().catch((err: unknown) => {
  console.error('KaryaOS MCP failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
