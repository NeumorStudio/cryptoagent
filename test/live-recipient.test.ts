// El firmante solo firma puentes cuyo destinatario es la propia cartera (salvo las rutas de confianza, que se
// comprueban después de enviar) y swaps en Solana en los que lo comprado llega a una cuenta de la IA.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { checkEvmTx, checkSolanaBridgeRecipient, checkSolanaReceive, solanaHex, type AccountState } from "../src/live/policy.js";

const ME = "0x835BC468fD6D69027fe623258dbF5896ca98FBB1";
const SOL_ME = Keypair.generate().publicKey.toBase58();
const LIFI = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const pad = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const ascii = (s: string) => Buffer.from(s).toString("hex").padEnd(64, "0");

test("EVM → Solana: la dirección de la IA en Solana tiene que ir en la calldata, salvo en Relay o Layerswap", () => {
  const l = { maxValue: 0n, destSolana: SOL_ME };
  // El remitente (la propia cartera EVM) siempre aparece: no basta para un destino en Solana.
  const withoutDest = `0xa3443faa${pad(ME)}${ascii("polymerStandard")}`;
  assert.match(checkEvmTx({ chainId: 8453, to: LIFI, data: withoutDest, value: "0" }, "bridge", ME, { ...l, route: "polymerStandard" }).join(), /Solana/);
  const withDest = `0xa3443faa${pad(ME)}${solanaHex(SOL_ME)}`;
  assert.deepEqual(checkEvmTx({ chainId: 8453, to: LIFI, data: withDest, value: "0" }, "bridge", ME, { ...l, route: "polymerStandard" }), []);
  // Relay no lleva el destinatario, pero su nombre sí va en la calldata (BridgeData): se admite y se comprueba después.
  const relay = `0xa3443faa${pad(ME)}${ascii("relaydepository")}`;
  assert.deepEqual(checkEvmTx({ chainId: 8453, to: LIFI, data: relay, value: "0" }, "bridge", ME, { ...l, route: "relaydepository" }), []);
  // Decir que es Relay sin que lo sea no vale.
  assert.match(checkEvmTx({ chainId: 8453, to: LIFI, data: withoutDest, value: "0" }, "bridge", ME, { ...l, route: "relaydepository" }).join(), /Solana/);
});

test("Solana → EVM: la dirección EVM de la IA tiene que ir en la transacción, salvo en las rutas de confianza", () => {
  const evm = Buffer.from(ME.slice(2), "hex");
  assert.deepEqual(checkSolanaBridgeRecipient(Buffer.concat([Buffer.from([1, 2, 3]), evm, Buffer.from([4])]), ME, "mayan"), []);
  assert.match(checkSolanaBridgeRecipient(Buffer.from([1, 2, 3, 4]), ME, "mayan").join(), /destinatario/);
  assert.deepEqual(checkSolanaBridgeRecipient(Buffer.from([1, 2, 3, 4]), ME, "layerswap"), []);
});

test("Swap en Solana: lo comprado tiene que llegar a una cuenta de la IA (también si la crea la transacción)", () => {
  const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const SOL = "So11111111111111111111111111111111111111112";
  const ata = "AtaDeLaIA1111111111111111111111111111111111";
  const pre: AccountState[] = [
    { address: SOL_ME, lamports: 100_000_000n },
    { address: ata, lamports: 0n, mint: BONK, amount: 0n }, // aún no existe: la crea el swap
  ];
  const llega = new Map<string, AccountState | null>([
    [SOL_ME, { address: SOL_ME, lamports: 97_000_000n }],
    [ata, { address: ata, lamports: 2_039_280n, mint: BONK, amount: 5_000n }],
  ]);
  assert.deepEqual(checkSolanaReceive(SOL_ME, pre, llega, { mint: BONK, min: 4_000n }, 5_000_000n), []);
  const noLlega = new Map<string, AccountState | null>([[SOL_ME, { address: SOL_ME, lamports: 97_000_000n }], [ata, null]]);
  assert.match(checkSolanaReceive(SOL_ME, pre, noLlega, { mint: BONK, min: 4_000n }, 5_000_000n).join(), /no llega a la cartera/);
  // Comprar SOL: sube el SOL de la cartera (descontadas comisiones, que se suman con lo permitido para ellas).
  const sol = new Map<string, AccountState | null>([[SOL_ME, { address: SOL_ME, lamports: 108_000_000n }]]);
  assert.deepEqual(checkSolanaReceive(SOL_ME, [pre[0]!], sol, { mint: SOL, min: 9_000_000n }, 1_000_000n), []);
  assert.match(checkSolanaReceive(SOL_ME, [pre[0]!], sol, { mint: SOL, min: 20_000_000n }, 1_000_000n).join(), /no llega/);
});

test("Cerrar cuentas vacías: solo CloseAccount de cuentas propias con la renta hacia la propia cartera", async () => {
  const { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram } = await import("@solana/web3.js");
  const { checkSolanaCloseOnly } = await import("../src/live/policy.js");
  const owner = Keypair.generate().publicKey;
  const other = Keypair.generate().publicKey;
  const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const close = (dest: InstanceType<typeof PublicKey>) =>
    new TransactionInstruction({
      programId: TOKEN,
      keys: [
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
        { pubkey: dest, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([9]),
    });
  const tx = (ixs: InstanceType<typeof TransactionInstruction>[]) =>
    new VersionedTransaction(new TransactionMessage({ payerKey: owner, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message());
  assert.deepEqual(checkSolanaCloseOnly(tx([close(owner), close(owner)]), owner.toBase58()), []);
  assert.match(checkSolanaCloseOnly(tx([close(other)]), owner.toBase58()).join(), /volver a la cartera/);
  assert.match(checkSolanaCloseOnly(tx([SystemProgram.transfer({ fromPubkey: owner, toPubkey: other, lamports: 1 })]), owner.toBase58()).join(), /solo se admiten cierres/);
});
