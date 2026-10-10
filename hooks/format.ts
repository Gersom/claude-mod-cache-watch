import type { Texts } from './i18n'

/** From just refreshed to about to cool: the color the text takes as the cache loses heat. */
export type Level = 'red' | 'orange' | 'yellow' | 'white' | 'ice'

/** The cache lasts one hour after a request unless the `ttl` option says otherwise. */
export const DEFAULT_TTL_MS = 3_600_000

/** How long the cache lasts after a request, by the value of the `ttl` option. */
export const TTL_MS: Record<string, number> = { '1h': DEFAULT_TTL_MS, '5m': 300_000 }

/** The TTL in milliseconds for the option's value; the default's when it names none this mod knows. */
export const ttlOf = (value: unknown): number =>
  (typeof value === 'string' ? TTL_MS[value] : undefined) ?? DEFAULT_TTL_MS

/** The share of the TTL left above which each level holds: red, orange, yellow, white, and ice below the last. */
export const STEPS: [Level, number][] = [
  ['red', 0.8],
  ['orange', 0.6],
  ['yellow', 0.4],
  ['white', 0.2]
]

export const ACCENT = '#fb923c'
export const COLORS = {
  red: '#ef4444',
  orange: '#fb923c',
  yellow: '#facc15',
  white: '#ffffff',
  ice: '#a5f3fc',
  cold: '#93c5fd'
}

/** The emoji of a level: fire while it is red or orange, sun at yellow or white, snowflake about to cool, snowman once cold. */
export const EMOJI = { red: '🔥', orange: '🔥', yellow: '☀️', white: '☀️', ice: '❄️', cold: '⛄' }

/** How the cache is shown: the framed row above the prompt, or the mod's status line (plain text). */
export type Display = 'panel' | 'status'

export const DISPLAYS: Display[] = ['panel', 'status']

/** The display a value names (the option's, a saved one, a command's argument); `undefined` when it names none this mod knows. */
export const knownDisplay = (value: unknown): Display | undefined =>
  DISPLAYS.find(display => display === value)

/** The display for the `display` option's value; the panel when it names none this mod knows. */
export const displayOf = (value: unknown): Display => knownDisplay(value) ?? 'panel'

/** The other display: what `/cache-watch` with no argument switches to. */
export const otherDisplay = (display: Display): Display => (display === 'panel' ? 'status' : 'panel')

/** Time left on the cache, in ms: from the last request, never more than the TTL nor less than zero. */
export const remaining = (lastAt: number, now: number, ttlMs: number) =>
  Math.max(0, Math.min(ttlMs, lastAt + ttlMs - now))

export type Status = { kind: 'hot'; leftMs: number; level: Level } | { kind: 'cold' }

/** Hot while the TTL has not run out since the last request; none before the first one. */
export const statusOf = (lastAt: number | null, now: number, ttlMs: number): Status | null => {
  if (lastAt === null) return null

  const leftMs = remaining(lastAt, now, ttlMs)

  return leftMs > 0 ? { kind: 'hot', leftMs, level: levelOf(leftMs, ttlMs) } : { kind: 'cold' }
}

/** The level for the share of the TTL still left: the hotter the more is left. */
export const levelOf = (leftMs: number, ttlMs: number): Level =>
  STEPS.find(([, above]) => leftMs > ttlMs * above)?.[0] ?? 'ice'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `47:12` below an hour, `1:00:00` from it; whole seconds rounded up, so the TTL's first second reads in full. */
export const countdown = (ms: number) => {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`
}

/** `850`, `84k`, `1.5k`, `1M`: tokens in their shortest readable form. */
export const compactTokens = (tokens: number) => {
  const trim = (n: number) => String(Math.round(n * 10) / 10)

  if (tokens >= 1_000_000) return `${trim(tokens / 1_000_000)}M`
  if (tokens >= 1000) return `${trim(tokens / 1000)}k`

  return String(Math.max(0, Math.round(tokens)))
}

/** What the status line says, piece by piece: the same words as the panel's row. */
export type StatusParts = {
  label: string
  emoji: string
  /** `Caliente` / `Frío`. */
  word: string
  /** The text after the word: `se enfría en`, or what the next request will rewrite. */
  note: string
  /** The countdown; none once cold. */
  value?: string
}

/** The pieces of the status line for the cache's status, in the language of `t`; `known` are the context tokens, if any. */
export const statusParts = (status: Status, t: Texts, known: number | null): StatusParts =>
  status.kind === 'hot'
    ? {
        label: t.label,
        emoji: EMOJI[status.level],
        word: t.hot,
        note: t.coolsIn,
        value: countdown(status.leftMs)
      }
    : {
        label: t.label,
        emoji: EMOJI.cold,
        word: t.cold,
        note: t.rewrite(known === null ? null : compactTokens(known))
      }

/** The status line, in plain text: `◆ Caché  🔥 Caliente · se enfría en 47:12`. */
export const statusText = (parts: StatusParts) => {
  const { label, emoji, word, note, value } = parts

  return `◆ ${label}  ${emoji} ${word} · ${note}${value === undefined ? '' : ` ${value}`}`
}
