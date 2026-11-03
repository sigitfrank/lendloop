// HMAC-SHA256 request signing between Convex and n8n (both directions).
//
// Signed string:  "{timestamp}.{METHOD}.{path?query}.{rawBody}"
// Headers:        X-LendLoop-Timestamp: unix seconds
//                 X-LendLoop-Signature: lowercase hex HMAC-SHA256
//
// Binding method + path means a signature for one endpoint can't be replayed
// on another; the timestamp window limits replays of the same request.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export type SignedParts = { timestamp: string; method: string; path: string; body: string };

const encoder = new TextEncoder();

function canonical({ timestamp, method, path, body }: SignedParts): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${timestamp}.${method.toUpperCase()}.${path}.${body}`);
}

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null; // SHA-256 → 32 bytes
  return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

export async function sign(secret: string, parts: SignedParts): Promise<string> {
  const key = await importKey(secret, "sign");
  return toHex(await crypto.subtle.sign("HMAC", key, canonical(parts)));
}

/**
 * True only if the timestamp is within the allowed window and the signature
 * matches. crypto.subtle.verify compares in constant time.
 */
export async function verify(
  secret: string,
  parts: SignedParts,
  signature: string,
  nowSeconds: number,
): Promise<boolean> {
  const timestamp = Number(parts.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = fromHex(signature.toLowerCase());
  if (!expected) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, expected, canonical(parts));
}
