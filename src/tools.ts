// Defines Vercel AI SDK tools that Mortem can wrap and trace as tool_call events.
// Two tools read market data, while assess_trade produces a deterministic verdict for repeatable testing.

import { tool } from "ai"
import { z } from "zod"
import { fetchJupiterQuote } from "./jupiter.js"
import { fetchPythPrice } from "./pyth.js"

type TradeVerdict = "no_route" | "high_impact" | "acceptable" | "favorable"

export const tools = {
  get_token_price: tool({
    description: "Get the current USD price of a Solana token from Pyth oracle",
    parameters: z.object({
      symbol: z.string().describe("Token symbol e.g. SOL, JUP, BONK, WIF"),
    }),
    execute: async ({ symbol }) => {
      const price = await fetchPythPrice(symbol)
      return {
        symbol: price.symbol,
        price_usd: price.price,
        confidence_usd: price.confidence,
        published_at: new Date(price.publishTime * 1000).toISOString(),
      }
    },
  }),

  get_swap_quote: tool({
    description:
      "Get a Jupiter swap quote. Returns the expected output amount and price impact for a SOL to token swap.",
    parameters: z.object({
      from_token: z.string().describe("Source token symbol"),
      to_token: z.string().describe("Target token symbol"),
      amount_sol: z.number().default(1).describe("Amount of SOL to swap"),
    }),
    execute: async ({ from_token, to_token, amount_sol }) => {
      const quote = await fetchJupiterQuote(from_token, to_token, amount_sol)
      return {
        from: from_token,
        to: to_token,
        amount_in: quote.inAmount,
        amount_out: quote.outAmount,
        price_impact_pct: quote.priceImpactPct,
        has_route: quote.hasRoute,
        route_steps: quote.routePlan.length,
      }
    },
  }),

  assess_trade: tool({
    description:
      "Given price and quote data, assess whether the trade looks favorable. Returns a structured verdict.",
    parameters: z.object({
      token: z.string(),
      current_price_usd: z.number(),
      price_impact_pct: z.number(),
      has_route: z.boolean(),
      amount_sol: z.number(),
    }),
    execute: async ({
      token,
      current_price_usd,
      price_impact_pct,
      has_route,
      amount_sol,
    }) => {
      const verdict: TradeVerdict = !has_route
        ? "no_route"
        : price_impact_pct > 2
          ? "high_impact"
          : price_impact_pct > 0.5
            ? "acceptable"
            : "favorable"

      return {
        token,
        verdict,
        price_usd: current_price_usd,
        price_impact_pct,
        has_route,
        amount_sol,
        reason:
          verdict === "no_route"
            ? "Jupiter has no route for this token"
            : verdict === "high_impact"
              ? `Price impact ${price_impact_pct.toFixed(2)}% is too high`
              : `Trade looks ${verdict}`,
      }
    },
  }),
}
