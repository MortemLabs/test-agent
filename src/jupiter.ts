// Fetches read-only swap quotes from Jupiter for price discovery.
// The agent never submits swaps; failed quote responses become no-route data for Mortem failure classification.

const JUPITER_API_BASE_URL = (process.env.JUPITER_API_BASE_URL ?? "https://api.jup.ag").replace(/\/$/, "")
const JUPITER_API_KEY = process.env.JUPITER_API_KEY && process.env.JUPITER_API_KEY.length > 0 ? process.env.JUPITER_API_KEY : undefined

const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
}

interface JupiterQuoteResponse {
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan?: unknown[]
}

export interface JupiterQuote {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: number
  routePlan: unknown[]
  hasRoute: boolean
}

export async function fetchJupiterQuote(
  fromSymbol: string,
  toSymbol: string,
  amountSol: number = 1,
): Promise<JupiterQuote> {
  const inputMint = TOKEN_MINTS[fromSymbol.toUpperCase()]
  const outputMint = TOKEN_MINTS[toSymbol.toUpperCase()]

  if (!inputMint || !outputMint) {
    throw new Error(`Unknown token: ${!inputMint ? fromSymbol : toSymbol}`)
  }

  const amount = Math.floor(amountSol * 1_000_000_000)
  const url =
    `${JUPITER_API_BASE_URL}/swap/v1/quote` +
    `?inputMint=${inputMint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amount}` +
    "&slippageBps=50"

  const noRouteQuote: JupiterQuote = {
    inputMint,
    outputMint,
    inAmount: String(amount),
    outAmount: "0",
    priceImpactPct: 0,
    routePlan: [],
    hasRoute: false,
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : undefined,
  })

  if (!res.ok) {
    return noRouteQuote
  }

  const data = (await res.json()) as JupiterQuoteResponse
  const routePlan = data.routePlan ?? []

  return {
    inputMint,
    outputMint,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    priceImpactPct: Number.parseFloat(data.priceImpactPct),
    routePlan,
    hasRoute: routePlan.length > 0,
  }
}
