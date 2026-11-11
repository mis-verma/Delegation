import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const user = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

export const registerPrompts = (server: McpServer): void => {
  server.registerPrompt(
    'morning_brief',
    {
      title: 'Morning brief',
      description: 'A short start-of-day summary: your numbers, what is late, what waits for you.',
      argsSchema: { scope: z.enum(['mine', 'visible']).optional().describe('"mine" for your own work, "visible" for your whole team. Default mine.') },
    },
    ({ scope }) =>
      user(
        `Give me a morning brief for KaryaOS. Call get_today_numbers with scope "${scope ?? 'mine'}", then list_pending_approvals, then list_team_checklists with status "overdue". ` +
          'Answer in at most six short lines: the headline numbers, what is late, how many approvals wait and how many are over 24 hours, and the one thing to do first. Do not change anything.',
      ),
  );

  server.registerPrompt(
    'approval_triage',
    {
      title: 'Approval triage',
      description: 'Sort what waits for approval by age and suggest what to approve or send back. Does not act on its own.',
    },
    () =>
      user(
        'Call list_pending_approvals. Group the items as over 24 hours and newer. For each group say what looks safe to approve and what needs a closer look, and why. ' +
          'Only suggest. Do not approve or send anything back unless I tell you to and confirm each one.',
      ),
  );

  server.registerPrompt(
    'unstarted_checklists',
    {
      title: 'Checklists nobody started',
      description: 'Which checklist runs today have no question answered yet, by store.',
    },
    () =>
      user('Call list_team_checklists with status "pending", period "today" and notStartedOnly true. Group the runs by store and tell me which stores need a reminder first.'),
  );
};
