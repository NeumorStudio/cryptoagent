// Cartera real de la IA: una frase BIP-39 nueva, de la que salen una cuenta EVM (la misma en Base y
// BNB Chain) y una de Solana, con las rutas estándar de MetaMask y Phantom, para poder importarla y verla.
//
// Seguridad: la frase se guarda cifrada (AES-256-GCM con una clave derivada por scrypt de la contraseña
// del usuario) y solo la descifra el firmante (src/live/signer). Este módulo no la escribe nunca en
// la base de datos, el diario ni ninguna salida de herramienta: el modelo no debe verla jamás.
// Las direcciones públicas van en un archivo aparte, legible por el servidor MCP.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { base58 } from "@scure/base";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const EVM_PATH = "m/44'/60'/0'/0/0";
/** Ruta de Phantom y de la mayoría de carteras de Solana. */
export const SOLANA_PATH = [44, 501, 0, 0];

export interface WalletPublic {
  version: 1;
  createdAt: string;
  /** Dirección EVM (Base y BNB Chain), con checksum EIP-55. */
  evm: string;
  /** Dirección de Solana (base58). */
  solana: string;
}

export interface Accounts {
  evm: { address: string; privateKey: Uint8Array };
  /** secretKey de 64 bytes (privada + pública), el formato de @solana/web3.js. */
  solana: { address: string; secretKey: Uint8Array };
}

interface WalletFile {
  version: 1;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: { name: "aes-256-gcm"; iv: string; tag: string };
  data: string;
}

const SCRYPT = { N: 2 ** 16, r: 8, p: 1 };
const MIN_PASSWORD = 10;

const files = (dir: string) => ({ secret: path.join(dir, "wallet.enc"), pub: path.join(dir, "wallet.json") });

// ─── Derivación ─────────────────────────────────────────────────────────────

function checksumAddress(hexNo0x: string): string {
  const hash = Buffer.from(keccak_256(new TextEncoder().encode(hexNo0x))).toString("hex");
  return "0x" + [...hexNo0x].map((c, i) => (parseInt(hash[i]!, 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function evmAddressOf(privateKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privateKey, false).slice(1);
  return checksumAddress(Buffer.from(keccak_256(pub).slice(-20)).toString("hex"));
}

/** SLIP-10 para ed25519 (solo rutas endurecidas), como hacen Phantom y Solflare. */
function slip10Ed25519(seed: Uint8Array, pathIdx: number[]): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const i of pathIdx) {
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (i | 0x80000000) >>> 0);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function deriveAccounts(mnemonic: string): Accounts {
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error("Frase de recuperación no válida");
  const seed = mnemonicToSeedSync(mnemonic);
  const evmKey = HDKey.fromMasterSeed(seed).derive(EVM_PATH).privateKey;
  if (!evmKey) throw new Error("No se pudo derivar la clave EVM");
  const solPriv = slip10Ed25519(seed, SOLANA_PATH);
  const solPub = ed25519.getPublicKey(solPriv);
  const secretKey = new Uint8Array(64);
  secretKey.set(solPriv);
  secretKey.set(solPub, 32);
  return {
    evm: { address: evmAddressOf(evmKey), privateKey: evmKey },
    solana: { address: base58.encode(solPub), secretKey },
  };
}

// ─── Archivo cifrado ────────────────────────────────────────────────────────

const kdf = (password: string, salt: Buffer, p = SCRYPT) =>
  scryptSync(password.normalize("NFKC"), salt, 32, { N: p.N, r: p.r, p: p.p, maxmem: 256 * 1024 * 1024 });

export function walletExists(dir: string): boolean {
  return existsSync(files(dir).secret);
}

/** Direcciones públicas (no hace falta la contraseña). */
export function readWalletPublic(dir: string): WalletPublic | null {
  const f = files(dir).pub;
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as WalletPublic) : null;
}

/**
 * Crea una cartera nueva. Devuelve la frase para enseñarla UNA sola vez al usuario (en la página de
 * la cartera, nunca al modelo). Si ya existe una cartera, falla: no se sobrescribe nunca.
 */
export function createWallet(dir: string, password: string): { mnemonic: string; pub: WalletPublic } {
  if (password.length < MIN_PASSWORD) throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (walletExists(dir)) throw new Error("Ya existe una cartera: no se sobrescribe");
  mkdirSync(dir, { recursive: true });
  const mnemonic = generateMnemonic(wordlist, 128);
  const accounts = deriveAccounts(mnemonic);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kdf(password, salt), iv);
  const data = Buffer.concat([cipher.update(mnemonic, "utf8"), cipher.final()]);
  const file: WalletFile = {
    version: 1,
    kdf: { name: "scrypt", ...SCRYPT, salt: salt.toString("base64") },
    cipher: { name: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    data: data.toString("base64"),
  };
  const pub: WalletPublic = { version: 1, createdAt: new Date().toISOString(), evm: accounts.evm.address, solana: accounts.solana.address };
  const { secret, pub: pubFile } = files(dir);
  writeFileSync(secret, JSON.stringify(file), { mode: 0o600, flag: "wx" });
  writeFileSync(pubFile, JSON.stringify(pub, null, 2), { mode: 0o600 });
  return { mnemonic, pub };
}

/** Descifra la cartera. Solo lo llama el firmante. */
export function unlockWallet(dir: string, password: string): Accounts {
  const { secret } = files(dir);
  if (!existsSync(secret)) throw new Error("No hay ninguna cartera creada");
  const f = JSON.parse(readFileSync(secret, "utf8")) as WalletFile;
  const decipher = createDecipheriv("aes-256-gcm", kdf(password, Buffer.from(f.kdf.salt, "base64"), f.kdf), Buffer.from(f.cipher.iv, "base64"));
  decipher.setAuthTag(Buffer.from(f.cipher.tag, "base64"));
  let mnemonic: string;
  try {
    mnemonic = Buffer.concat([decipher.update(Buffer.from(f.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Contraseña incorrecta");
  }
  const accounts = deriveAccounts(mnemonic);
  const pub = readWalletPublic(dir);
  if (pub && (pub.evm !== accounts.evm.address || pub.solana !== accounts.solana.address)) {
    throw new Error("Las direcciones guardadas no coinciden con la cartera cifrada");
  }
  return accounts;
}
