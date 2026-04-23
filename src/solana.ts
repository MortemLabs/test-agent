// Creates the devnet Solana connection and sends an optional memo transaction.
// The memo is a harmless no-op used only to exercise Mortem's Solana transaction tracing.

import {
  Connection,
  Keypair,
  PublicKey,
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
  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo),
    }),
  )

  return sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: "confirmed",
  })
}
