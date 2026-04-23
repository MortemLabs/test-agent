// Entry point for running the Mortem test agent from the command line.
// It loads environment variables, prints run metadata, and exits cleanly on success or failure.

import "dotenv/config"
import { config } from "./config.js"
import { runAgent } from "./agent.js"

console.log("\n🔍 Mortem test agent starting...")
console.log(`   Target token: ${config.targetToken}`)
console.log(`   Agent ID:     ${config.mortemAgentId}`)
console.log(`   LLM provider: ${config.llmProvider}`)
console.log(`   LLM model:    ${config.llmModel}`)
console.log(`   Devnet tx:    ${config.sendDevnetTx}\n`)

runAgent(config.targetToken)
  .then((result) => {
    console.log("✅ Agent completed")
    console.log(`   Token:      ${result.token}`)
    console.log(`   Verdict:    ${result.verdict}`)
    console.log(`   Summary:    ${result.summary}`)
    if (result.txSignature) {
      console.log(
        `   Tx:         https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`,
      )
    }
    console.log("\n📊 View trace in Mortem:")
    console.log(`   ${result.shareUrl}`)
    console.log(`   Trace ID: ${result.traceId}\n`)
    process.exit(0)
  })
  .catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error("❌ Agent failed:", error.message)
    console.error(error)
    process.exit(1)
  })
