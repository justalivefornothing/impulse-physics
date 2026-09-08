/**
 * Encodes a world snapshot (JSON text) into a URL-safe string and back.
 *
 * Layout: a one-character scheme prefix followed by base64url data.
 *   'z' — raw DEFLATE (CompressionStream), the normal case
 *   'j' — plain UTF-8, used when the browser lacks CompressionStream
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_LOOKUP = new Int16Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    out += B64[(triple >> 18) & 63]! + B64[(triple >> 12) & 63]!
    if (i + 1 < bytes.length) out += B64[(triple >> 6) & 63]!
    if (i + 2 < bytes.length) out += B64[triple & 63]!
  }
  return out
}

export function base64UrlToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9\-_]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)]!
    const c1 = i + 1 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 1)]! : 0
    const c2 = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)]! : 0
    const c3 = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)]! : 0
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('invalid base64url')
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3
    if (o < out.length) out[o++] = (triple >> 16) & 255
    if (i + 2 < clean.length && o < out.length) out[o++] = (triple >> 8) & 255
    if (i + 3 < clean.length && o < out.length) out[o++] = triple & 255
  }
  return out
}

async function pipeThrough(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, BufferSource>): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  const buf = await new Response(src).arrayBuffer()
  return new Uint8Array(buf)
}

const hasCompression = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

export async function encodeForUrl(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json)
  if (!hasCompression) return 'j' + bytesToBase64Url(bytes)
  const packed = await pipeThrough(bytes, new CompressionStream('deflate-raw'))
  return 'z' + bytesToBase64Url(packed)
}

export async function decodeFromUrl(text: string): Promise<string> {
  const scheme = text[0]
  const body = text.slice(1)
  if (scheme === 'j') return new TextDecoder().decode(base64UrlToBytes(body))
  if (scheme === 'z') {
    if (!hasCompression) throw new Error('this browser cannot decompress shared scenes')
    const bytes = await pipeThrough(base64UrlToBytes(body), new DecompressionStream('deflate-raw'))
    return new TextDecoder().decode(bytes)
  }
  throw new Error('unknown share encoding')
}

/** Query-style key used in the URL hash: `#s=<encoded>`. */
export const SHARE_KEY = 's'

export function readSharedFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  return params.get(SHARE_KEY)
}

export function buildShareUrl(encoded: string): string {
  const url = new URL(window.location.href)
  url.hash = `${SHARE_KEY}=${encoded}`
  return url.toString()
}
