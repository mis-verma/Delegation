import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';
import { registerTools } from './tools.js';

export const buildServer = (): McpServer => {
  const server = new McpServer(
    { name: 'karyaos', version: '0.2.0' },
    {
      instructions:
        'Access to KaryaOS as one signed-in person. Reading is always on. Approve and send-back tools exist only when the operator enabled writes, and need confirm: true. Every answer is limited to what that person is allowed to see. Counts are for the current organisation day.',
    },
  );
  registerTools(server);
  registerPrompts(server);
  return server;
};
