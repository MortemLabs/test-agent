// Orchestrates the Mortem-instrumented Solana DeFi research run.
// A single invocation produces LLM, tool, and optional Solana transaction events inside one trace.

import { createOpenAI } from "@ai-sdk/openai"
import { Mortem } from "@mortemlabs/sdk"
import { generateText } from "ai"
import { config } from "./config.js"
import { runOllamaResearch, runOllamaSummary } from "./ollama.js"
import { createConnection, loadKeypair, sendMemoTx } from "./solana.js"
import { tools } from "./tools.js"

interface ToolResultLike {
  toolName?: string
  result?: unknown
}

interface GenerateTextWithToolResults {
  text: string
  toolResults?: ToolResultLike[]
}

interface AssessTradeResult {
  verdict?: string
}

export interface AgentResult {
  token: string
  verdict: string
  summary: string
  txSignature?: string
  traceId: string
  shareUrl: string
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function isAssessTradeResult(result: unknown): result is AssessTradeResult {
  return typeof result === "object" && result !== null && "verdict" in result
}

function extractVerdict(toolResults: ToolResultLike[] | undefined): string {
  const assessResult = toolResults?.find((result) => result.toolName === "assess_trade")

  if (isAssessTradeResult(assessResult?.result)) {
    return assessResult.result.verdict ?? "unknown"
  }

  return "unknown"
}

function getOpenAiApiKey(): string {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
  }

  return config.openaiApiKey
}

export async function runAgent(targetToken: string): Promise<AgentResult> {
  const mortem = new Mortem({
    apiKey: config.mortemApiKey,
    agentId: config.mortemAgentId,
    verifyToken: config.mortemVerifyToken,
    captureMarket: true,
    environment: "devnet",
  })

  const session = await mortem.startSession({
    inputSummary: `Analyze ${targetToken} - should I swap?`,
  })

  const tracedTools = mortem.wrapTools(tools)

  const connection = mortem.wrapConnection(createConnection())
  const keypair = loadKeypair()

  try {
    let toolResults: ToolResultLike[] | undefined
    let summary: string

    if (config.llmProvider === "openai") {
      const openaiClient = createOpenAI({
        apiKey: getOpenAiApiKey(),
      })
      const openai = mortem.wrapOpenAI(openaiClient)

      const researchResult = (await generateText({
        model: openai(config.llmModel),
        tools: tracedTools,
        maxSteps: 5,
        abortSignal: AbortSignal.timeout(5000),
        system: `You are a Solana DeFi research agent.
Your job is to research a token and assess whether a 1 SOL swap makes sense right now.

Steps you must follow:
1. Call get_token_price for the requested token
2. Call get_swap_quote from SOL to that token for 1 SOL
3. Call assess_trade with the results
4. Write a brief one-paragraph analysis

Always complete all steps even if a route is not available.
A missing route is useful information, not an error.`,
        messages: [
          {
            role: "user",
            content: `Research ${targetToken}. Should I swap 1 SOL for ${targetToken} right now?`,
          },
        ],
      })) as GenerateTextWithToolResults

      const summaryResult = await generateText({
        model: openai(config.llmModel),
        abortSignal: AbortSignal.timeout(5000),
        system:
          "You write very short, plain English summaries for non-technical users. Max 2 sentences. No jargon.",
        messages: [
          {
            role: "user",
            content: `Summarize this trading analysis in 2 sentences: ${researchResult.text}`,
          },
        ],
      })

      toolResults = researchResult.toolResults
      summary = summaryResult.text
    } else {
      const researchResult = await runOllamaResearch(targetToken)
      toolResults = researchResult.toolResults
      summary = await runOllamaSummary(researchResult.text)
    }

    const verdict = extractVerdict(toolResults)
    if (verdict === "no_route") {
      throw new Error(`market_condition:no_route:${targetToken}`)
    }

    let txSignature: string | undefined
    if (config.sendDevnetTx) {
      txSignature = await sendMemoTx(
        connection,
        keypair,
        JSON.stringify({
          agent: "mortem-test-agent",
          token: targetToken,
          verdict,
          ts: Date.now(),
        }),
      )
    }

    await session.end("success")

    return {
      token: targetToken,
      verdict,
      summary,
      txSignature,
      traceId: session.traceId,
      shareUrl: session.shareUrl,
    }
  } catch (err) {
    const error = toError(err)
    await session.fail(error)
    throw error
  }
}
