// Fetches token prices from Pyth Hermes using well-known feed IDs for devnet testing.
// This module is intentionally small so Mortem traces clearly show the market data boundary.

const PYTH_HERMES = "https://hermes.pyth.network"

const PRICE_FEED_IDS: Record<string, string> = {
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  JUP: "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
  BONK: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
  WIF: "0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
}

interface PythHermesFeed {
  price: {
    price: string
    conf: string
    expo: number
    publish_time: number
  }
}

export interface PythPrice {
  symbol: string
  price: number
  confidence: number
  publishTime: number
}

export async function fetchPythPrice(symbol: string): Promise<PythPrice> {
  const normalizedSymbol = symbol.toUpperCase()
  const feedId = PRICE_FEED_IDS[normalizedSymbol]
  if (!feedId) {
    throw new Error(`No Pyth feed ID for symbol: ${symbol}`)
  }

  const res = await fetch(`${PYTH_HERMES}/api/latest_price_feeds?ids[]=${feedId}`, {
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    throw new Error(`Pyth API error: ${res.status}`)
  }

  const data = (await res.json()) as PythHermesFeed[]
  const feed = data[0]
  if (!feed) {
    throw new Error(`Pyth API returned no price feed for symbol: ${symbol}`)
  }

  const scale = Math.pow(10, feed.price.expo)
  const price = Number(feed.price.price) * scale
  const confidence = Number(feed.price.conf) * scale

  return {
    symbol: normalizedSymbol,
    price,
    confidence,
    publishTime: feed.price.publish_time,
  }
}
