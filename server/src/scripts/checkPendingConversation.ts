import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { pendingTaskConversations } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

const run = async () => {
    const phone = process.argv[2];
    if (!phone) {
        console.error('Usage: npx tsx src/scripts/checkPendingConversation.ts <phone>');
        process.exit(1);
    }

    await connectDB();

    const [conversation] = await db.select().from(pendingTaskConversations).where(eq(pendingTaskConversations.phone, phone)).limit(1);

    if (!conversation) {
        console.log(`No pending conversation for "${phone}".`);
    } else {
        console.log('Pending conversation found:');
        console.log(`  pendingSlot: ${conversation.pendingSlot}`);
        console.log(`  slotQueue:   ${JSON.stringify(conversation.slotQueue)}`);
        console.log(`  expiresAt:   ${conversation.expiresAt}`);
        console.log(`  draft:       ${JSON.stringify({
            title: conversation.draftTitle,
            context: conversation.draftContext,
            category: conversation.draftCategory,
            priority: conversation.draftPriority,
            dueDate: conversation.draftDueDate,
            assigneeId: conversation.draftAssigneeId,
            assigneeName: conversation.draftAssigneeName,
            departmentId: conversation.draftDepartmentId,
            departmentName: conversation.draftDepartmentName,
            rawInput: conversation.draftRawInput,
            inputMode: conversation.draftInputMode,
            confidence: conversation.draftConfidence,
            wonBy: conversation.draftWonBy,
        }, null, 2)}`);
    }

    await disconnectDB();
    process.exit(0);
}

run();
