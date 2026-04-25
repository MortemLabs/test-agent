// Creates the devnet Solana connection and sends an optional memo transaction.
// The memo is a harmless no-op used only to exercise Mortem's Solana transaction tracing.

import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import bs58 from "bs58"
import { config } from "./config.js"

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

export function createConnection(): Connection {
  return new Connection(config.solanaRpcUrl, "confirmed")
}

export function loadKeypair(): Keypair {
  const decoded = bs58.decode(config.solanaPrivateKey)
  return Keypair.fromSecretKey(decoded)
}

export async function sendMemoTx(
  connection: Connection,
  keypair: Keypair,
  memo: string,
): Promise<string> {
  // On devnet it's common for fresh wallets to have 0 SOL; proactively airdrop so the
  // memo tx doesn't fail with "Attempt to debit an account but found no record of a prior credit."
  const balance = await connection.getBalance(keypair.publicKey, "confirmed")
  if (balance === 0 && /devnet/i.test(config.solanaRpcUrl)) {
    try {
      const sig = await connection.requestAirdrop(keypair.publicKey, 1_000_000_000)
      const latest = await connection.getLatestBlockhash("confirmed")
      await connection.confirmTransaction(
        { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        "confirmed",
      )
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      throw new Error(
        `Devnet wallet has 0 SOL and faucet airdrop failed.\n` +
          `Fund this address and retry: ${keypair.publicKey.toBase58()}\n` +
          `Original error: ${err.message}`,
      )
    }
  }

  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo),
    }),
  )

  try {
    return await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed",
    })
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs(connection).catch(() => undefined)
      const message =
        logs && logs.length > 0 ? `${err.message}\nLogs:\n${logs.join("\n")}` : err.message
      throw new Error(message)
    }
    throw err
  }
}
