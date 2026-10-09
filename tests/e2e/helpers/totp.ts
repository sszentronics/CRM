import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const STEP_SECONDS = 30;

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error(`Bad base32 character: ${ch}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP, the same 6-digit code an authenticator app shows. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const USED_DIR = path.join("playwright", ".auth", "totp-used");

/**
 * A code from a 30-second window not used before for this account. Auth servers
 * may refuse a code twice, so wait for the next window when needed.
 */
export async function freshTotp(secret: string, account: string): Promise<string> {
  mkdirSync(USED_DIR, { recursive: true });
  const file = path.join(USED_DIR, `${account.replace(/[^a-z0-9]/gi, "_")}.txt`);
  const last = existsSync(file) ? Number(readFileSync(file, "utf8")) : -1;
  let window = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  if (window <= last) {
    const waitMs = (last + 1) * STEP_SECONDS * 1000 - Date.now() + 250;
    await new Promise((r) => setTimeout(r, waitMs));
    window = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  }
  writeFileSync(file, String(window));
  return totp(secret);
}
