#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const {
  createGhIssueClient,
  processNextFeedback,
} = require("../lib/feedback-to-issue.js");


function resolveDatabaseUrl() {
  const value = String(process.env.LM_FEEDBACK_DATABASE_PUBLIC_URL || "").trim();
  if (!value) throw new Error("feedback_issue_database_not_configured");
  return value;
}


async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });
  try {
    const result = await processNextFeedback({
      query: pool.query.bind(pool),
      issueClient: createGhIssueClient(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}


main().catch((error) => {
  process.stderr.write(`feedback-to-issue failed: ${error.message}\n`);
  process.exitCode = 1;
});
