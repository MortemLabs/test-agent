# Mortem Test Agent

## What this is

This is a standalone test agent for Mortem. It analyzes a Solana token using Pyth prices and Jupiter quotes, asks an LLM for a trade assessment and summary, then optionally sends a devnet memo transaction.

Every step is traced by Mortem so developers can inspect realistic `llm_call`, `tool_call`, and `solana_tx` events in the dashboard.

## Setup

1. Clone the repo.

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy the example env file and fill in all values:

   ```bash
   cp .env.example .env
   ```

4. Generate a devnet wallet:

   ```bash
   solana-keygen new --outfile test-wallet.json
   ```

   Get the private key in base58:

   ```bash
   cat test-wallet.json | python3 -c "import json,sys,base58; print(base58.b58encode(bytes(json.load(sys.stdin))).decode())"
   ```

   Fund it:

   ```bash
   solana airdrop 2 <pubkey> --url devnet
   ```

5. Get Mortem credentials from your dashboard at [https://mortem.dev](https://mortem.dev) by creating a new agent.

6. Run the agent:

   ```bash
   pnpm start
   ```

## What to expect

- The agent runs and prints a verdict plus a short summary to the console.
- The trace appears in the Mortem dashboard within about 5 seconds.
- If `SEND_DEVNET_TX=true`, the memo transaction appears on Solana Explorer for devnet.

## Trying failure modes

Set `TARGET_TOKEN=FAKEXYZ`. The agent will fail during token lookup or quote discovery, call `session.fail()`, and Mortem should capture the error event for classification.

Set `OPENAI_API_KEY` to something invalid. The LLM call will fail, `session.fail()` will run, and Mortem captures the error event.
