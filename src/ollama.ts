// Runs the research and summary LLM calls through the official Ollama JavaScript SDK.
// This provider supports Ollama Cloud by sending the API key as a bearer token to the configured host.

import { Ollama, type Message, type Tool } from "ollama"
import { config } from "./config.js"
import { fetchJupiterQuote } from "./jupiter.js"
import { fetchPythPrice } from "./pyth.js"
import { assessTrade, type AssessTradeOutput } from "./tools.js"

export interface OllamaToolResult {
  toolName: string
  result: unknown
}

export interface OllamaResearchResult {
  text: string
  toolResults: OllamaToolResult[]
}

interface TokenPriceToolResult {
  symbol: string
  price_usd: number
  confidence_usd: number
  published_at: string
}

interface SwapQuoteToolResult {
  from: string
  to: string
  amount_in: string
  amount_out: string
  price_impact_pct: number
  has_route: boolean
  route_steps: number
}

interface ResearchState {
  price?: TokenPriceToolResult
  quote?: SwapQuoteToolResult
  assessment?: AssessTradeOutput
}

const OLLAMA_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_token_price",
      description: "Get the current USD price of a Solana token from Pyth oracle",
      parameters: {
        type: "object",
        required: ["symbol"],
        properties: {
          symbol: {
            type: "string",
            description: "Token symbol e.g. SOL, JUP, BONK, WIF",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_swap_quote",
      description:
        "Get a Jupiter swap quote. Returns the expected output amount and price impact for a SOL to token swap.",
      parameters: {
        type: "object",
        required: ["from_token", "to_token", "amount_sol"],
        properties: {
          from_token: {
            type: "string",
            description: "Source token symbol",
          },
          to_token: {
            type: "string",
            description: "Target token symbol",
          },
          amount_sol: {
            type: "number",
            description: "Amount of SOL to swap",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assess_trade",
      description:
        "Given price and quote data, assess whether the trade looks favorable. Returns a structured verdict.",
      parameters: {
        type: "object",
        required: ["token", "current_price_usd", "price_impact_pct", "has_route", "amount_sol"],
        properties: {
          token: {
            type: "string",
          },
          current_price_usd: {
            type: "number",
          },
          price_impact_pct: {
            type: "number",
          },
          has_route: {
            type: "boolean",
          },
          amount_sol: {
            type: "number",
          },
        },
      },
    },
  },
]

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })
}

function createOllamaClient(): Ollama {
  const apiKey = config.ollamaApiKey
  if (!apiKey) {
    throw new Error("OLLAMA_API_KEY is required when LLM_PROVIDER=ollama")
  }

  return new Ollama({
    host: config.ollamaHost,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    fetch: createTimeoutFetch(5000),
  })
}

function getStringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== "string") {
    throw new Error(`Ollama tool argument "${name}" must be a string`)
  }

  return value
}

function getNumberArg(args: Record<string, unknown>, name: string, fallback?: number): number {
  const value = args[name]
  if (value === undefined && fallback !== undefined) {
    return fallback
  }

  if (typeof value !== "number") {
    throw new Error(`Ollama tool argument "${name}" must be a number`)
  }

  return value
}

function getBooleanArg(args: Record<string, unknown>, name: string): boolean {
  const value = args[name]
  if (typeof value !== "boolean") {
    throw new Error(`Ollama tool argument "${name}" must be a boolean`)
  }

  return value
}

async function runTokenPriceTool(args: Record<string, unknown>): Promise<TokenPriceToolResult> {
  const price = await fetchPythPrice(getStringArg(args, "symbol"))

  return {
    symbol: price.symbol,
    price_usd: price.price,
    confidence_usd: price.confidence,
    published_at: new Date(price.publishTime * 1000).toISOString(),
  }
}

async function runSwapQuoteTool(args: Record<string, unknown>): Promise<SwapQuoteToolResult> {
  const fromToken = getStringArg(args, "from_token")
  const toToken = getStringArg(args, "to_token")
  const amountSol = getNumberArg(args, "amount_sol", 1)
  const quote = await fetchJupiterQuote(fromToken, toToken, amountSol)

  return {
    from: fromToken,
    to: toToken,
    amount_in: quote.inAmount,
    amount_out: quote.outAmount,
    price_impact_pct: quote.priceImpactPct,
    has_route: quote.hasRoute,
    route_steps: quote.routePlan.length,
  }
}

function runAssessTradeTool(args: Record<string, unknown>): AssessTradeOutput {
  return assessTrade({
    token: getStringArg(args, "token"),
    current_price_usd: getNumberArg(args, "current_price_usd"),
    price_impact_pct: getNumberArg(args, "price_impact_pct"),
    has_route: getBooleanArg(args, "has_route"),
    amount_sol: getNumberArg(args, "amount_sol"),
  })
}

function applyResultToState(
  state: ResearchState,
  toolName: string,
  result: unknown,
): void {
  if (toolName === "get_token_price") {
    state.price = result as TokenPriceToolResult
  } else if (toolName === "get_swap_quote") {
    state.quote = result as SwapQuoteToolResult
  } else if (toolName === "assess_trade") {
    state.assessment = result as AssessTradeOutput
  }
}

async function executeOllamaTool(
  toolName: string,
  args: Record<string, unknown>,
  state: ResearchState,
): Promise<OllamaToolResult> {
  let result: unknown

  if (toolName === "get_token_price") {
    result = await runTokenPriceTool(args)
  } else if (toolName === "get_swap_quote") {
    result = await runSwapQuoteTool(args)
  } else if (toolName === "assess_trade") {
    result = runAssessTradeTool(args)
  } else {
    throw new Error(`Unknown Ollama tool call: ${toolName}`)
  }

  applyResultToState(state, toolName, result)
  return { toolName, result }
}

function appendToolResult(messages: Message[], toolResult: OllamaToolResult): void {
  messages.push({
    role: "tool",
    tool_name: toolResult.toolName,
    content: JSON.stringify(toolResult.result),
  })
}

async function ensureRequiredTools(
  messages: Message[],
  toolResults: OllamaToolResult[],
  state: ResearchState,
  targetToken: string,
): Promise<void> {
  if (!state.price) {
    const result = await executeOllamaTool("get_token_price", { symbol: targetToken }, state)
    toolResults.push(result)
    appendToolResult(messages, result)
  }

  if (!state.quote) {
    const result = await executeOllamaTool(
      "get_swap_quote",
      {
        from_token: "SOL",
        to_token: targetToken,
        amount_sol: 1,
      },
      state,
    )
    toolResults.push(result)
    appendToolResult(messages, result)
  }

  if (!state.assessment && state.price && state.quote) {
    const result = await executeOllamaTool(
      "assess_trade",
      {
        token: targetToken,
        current_price_usd: state.price.price_usd,
        price_impact_pct: state.quote.price_impact_pct,
        has_route: state.quote.has_route,
        amount_sol: 1,
      },
      state,
    )
    toolResults.push(result)
    appendToolResult(messages, result)
  }
}

function fallbackAnalysis(targetToken: string, state: ResearchState): string {
  const verdict = state.assessment?.verdict ?? "unknown"
  const price = state.price?.price_usd ?? 0
  const impact = state.quote?.price_impact_pct ?? 0

  return `${targetToken} verdict: ${verdict}. Current price is $${price}, and the Jupiter quote has ${impact}% price impact.`
}

export async function runOllamaResearch(targetToken: string): Promise<OllamaResearchResult> {
  const ollama = createOllamaClient()
  const messages: Message[] = [
    {
      role: "system",
      content: `You are a Solana DeFi research agent.
Your job is to research a token and assess whether a 1 SOL swap makes sense right now.

Steps you must follow:
1. Call get_token_price for the requested token
2. Call get_swap_quote from SOL to that token for 1 SOL
3. Call assess_trade with the results
4. Write a brief one-paragraph analysis

Always complete all steps even if a route is not available.
A missing route is useful information, not an error.`,
    },
    {
      role: "user",
      content: `Research ${targetToken}. Should I swap 1 SOL for ${targetToken} right now?`,
    },
  ]
  const toolResults: OllamaToolResult[] = []
  const state: ResearchState = {}

  for (let step = 0; step < 5; step += 1) {
    const response = await ollama.chat({
      model: config.llmModel,
      messages,
      tools: OLLAMA_TOOLS,
      stream: false,
    })

    messages.push(response.message)
    const toolCalls = response.message.tool_calls ?? []
    if (toolCalls.length === 0) {
      break
    }

    for (const toolCall of toolCalls) {
      const toolResult = await executeOllamaTool(
        toolCall.function.name,
        toolCall.function.arguments as Record<string, unknown>,
        state,
      )
      toolResults.push(toolResult)
      appendToolResult(messages, toolResult)
    }
  }

  await ensureRequiredTools(messages, toolResults, state, targetToken)

  messages.push({
    role: "user",
    content: "Using the tool results above, write one concise paragraph with the final trade analysis.",
  })

  const finalResponse = await ollama.chat({
    model: config.llmModel,
    messages,
    stream: false,
  })
  const text = finalResponse.message.content.trim() || fallbackAnalysis(targetToken, state)

  return {
    text,
    toolResults,
  }
}

export async function runOllamaSummary(analysisText: string): Promise<string> {
  const ollama = createOllamaClient()
  const response = await ollama.chat({
    model: config.llmModel,
    messages: [
      {
        role: "system",
        content:
          "You write very short, plain English summaries for non-technical users. Max 2 sentences. No jargon.",
      },
      {
        role: "user",
        content: `Summarize this trading analysis in 2 sentences: ${analysisText}`,
      },
    ],
    stream: false,
  })

  return response.message.content.trim()
}
