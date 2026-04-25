// Loads and validates all environment variables required by the Mortem test agent.
// The exported config object keeps the rest of the codebase typed and free of direct process.env access.

type LlmProvider = "openai" | "ollama"

interface Config {
  llmProvider: LlmProvider
  llmModel: string
  openaiApiKey?: string
  ollamaApiKey?: string
  ollamaHost: string
  jupiterApiBaseUrl: string
  jupiterApiKey?: string
  ollamaTimeoutMs: number
  mortemApiKey: string
  mortemAgentId: string
  mortemVerifyToken: string
  mortemIngestUrl?: string
  mortemDashboardUrl: string
  solanaPrivateKey: string
  solanaRpcUrl: string
  targetToken: string
  sendDevnetTx: boolean
}

const requiredEnvVars = [
  "MORTEM_API_KEY",
  "MORTEM_AGENT_ID",
  "MORTEM_VERIFY_TOKEN",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_RPC_URL",
] as const

function getRequiredEnv(name: (typeof requiredEnvVars)[number]): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER ?? "openai"
  if (provider !== "openai" && provider !== "ollama") {
    throw new Error(`LLM_PROVIDER must be "openai" or "ollama", received: ${provider}`)
  }

  return provider
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

const llmProvider = getLlmProvider()
const openaiApiKey = getOptionalEnv("OPENAI_API_KEY")
const ollamaApiKey = getOptionalEnv("OLLAMA_API_KEY")

if (llmProvider === "openai" && !openaiApiKey) {
  throw new Error("Missing required environment variable for OpenAI provider: OPENAI_API_KEY")
}

if (llmProvider === "ollama" && !ollamaApiKey) {
  throw new Error("Missing required environment variable for Ollama provider: OLLAMA_API_KEY")
}

export const config: Config = {
  llmProvider,
  llmModel:
    process.env.LLM_MODEL ??
    (llmProvider === "ollama" ? (process.env.OLLAMA_MODEL ?? "llama3.1") : "gpt-4o-mini"),
  openaiApiKey,
  ollamaApiKey,
  ollamaHost: process.env.OLLAMA_HOST ?? "https://ollama.com",
  jupiterApiBaseUrl: process.env.JUPITER_API_BASE_URL ?? "https://api.jup.ag",
  jupiterApiKey: getOptionalEnv("JUPITER_API_KEY"),
  ollamaTimeoutMs: Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "20000", 10),
  mortemApiKey: getRequiredEnv("MORTEM_API_KEY"),
  mortemAgentId: getRequiredEnv("MORTEM_AGENT_ID"),
  mortemVerifyToken: getRequiredEnv("MORTEM_VERIFY_TOKEN"),
  mortemIngestUrl: getOptionalEnv("MORTEM_INGEST_URL"),
  mortemDashboardUrl: process.env.MORTEM_DASHBOARD_URL ?? "http://localhost:3000",
  solanaPrivateKey: getRequiredEnv("SOLANA_PRIVATE_KEY"),
  solanaRpcUrl: getRequiredEnv("SOLANA_RPC_URL"),
  targetToken: process.env.TARGET_TOKEN ?? "JUP",
  sendDevnetTx: process.env.SEND_DEVNET_TX === "true",
}
