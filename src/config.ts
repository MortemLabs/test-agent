// Loads and validates all environment variables required by the Mortem test agent.
// The exported config object keeps the rest of the codebase typed and free of direct process.env access.

interface Config {
  openaiApiKey: string
  mortemApiKey: string
  mortemAgentId: string
  mortemVerifyToken: string
  solanaPrivateKey: string
  solanaRpcUrl: string
  targetToken: string
  sendDevnetTx: boolean
}

const requiredEnvVars = [
  "OPENAI_API_KEY",
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

export const config: Config = {
  openaiApiKey: getRequiredEnv("OPENAI_API_KEY"),
  mortemApiKey: getRequiredEnv("MORTEM_API_KEY"),
  mortemAgentId: getRequiredEnv("MORTEM_AGENT_ID"),
  mortemVerifyToken: getRequiredEnv("MORTEM_VERIFY_TOKEN"),
  solanaPrivateKey: getRequiredEnv("SOLANA_PRIVATE_KEY"),
  solanaRpcUrl: getRequiredEnv("SOLANA_RPC_URL"),
  targetToken: process.env.TARGET_TOKEN ?? "JUP",
  sendDevnetTx: process.env.SEND_DEVNET_TX === "true",
}
