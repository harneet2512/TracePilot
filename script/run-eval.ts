import { db } from "../server/db";
import { evalSuites, evalRuns, evalCases } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

async function runEval() {
  const suiteName = process.argv[2] || "Basic QNA Suite";
  
  console.log(`Running eval suite: ${suiteName}`);

  // Find suite
  const suites = await db
    .select()
    .from(evalSuites)
    .where(eq(evalSuites.name, suiteName))
    .limit(1);

  if (suites.length === 0) {
    console.error(`Suite "${suiteName}" not found.`);
    process.exit(1);
  }

  const suite = suites[0];

  // Create eval run
  const [run] = await db
    .insert(evalRuns)
    .values({
      suiteId: suite.id,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  console.log(`Created eval run: ${run.id}`);

  // Note: In production, this would trigger the actual eval execution
  // For now, this is a placeholder that shows the structure
  console.log("Eval run created. Use the API endpoint /api/eval-suites/:id/run to execute.");
  console.log(`Run ID: ${run.id}`);

  process.exit(0);
}

runEval().catch((error) => {
  console.error("Error running eval:", error);
  process.exit(1);
});

