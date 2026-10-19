import "dotenv/config"
import { connectDB, disconnectDB } from "../config/db.js"
import { extractWithRules } from "../modules/tasks/ai/providers/ruleBased.provider.js"
import { resolveDueDate } from "../modules/tasks/ai/providers/task.ai.service.js"

const run = async () => {
    const text = process.argv[2];

    if (!text) {
        console.error("Usage: npx tsx src/scripts/testRuleBasedExtraction.ts \"<task text>\"");
        process.exit(1);
    }

    await connectDB();

    const referenceDate = new Date();
    const extraction = await extractWithRules(text, referenceDate);
    const dueDate = resolveDueDate(extraction.dueDateISO, text, referenceDate);

    console.log("Rule-based extraction result:");
    console.log(`  title:       ${extraction.title}`);
    console.log(`  category:    ${extraction.category}`);
    console.log(`  assignee:    ${extraction.assigneeName || "(none matched)"}`);
    console.log(`  department:  ${extraction.department || "(none matched)"}`);
    console.log(`  dueDate:     ${dueDate.toISOString()}`);
    console.log(`  confidence:  ${extraction.confidence}`);

    await disconnectDB();
    process.exit(0);
};

run();
