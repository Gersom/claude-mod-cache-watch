import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Lang } from '../types'
import { ACCENT, COLORS, EMOJI, compactTokens, countdown, statusOf, ttlOf } from './format'
import { DEFAULT_LANG, detectLang, textsOf } from './i18n'

const BORDER_COLOR = '#4b5563'
const TICK_MS = 1000

const lastAt = atom({ plugin: 'cache-watch', key: 'lastAt' } as const, null as number | null)
const tokens = atom({ plugin: 'cache-watch', key: 'tokens' } as const, null as number | null)
const now = atom({ plugin: 'cache-watch', key: 'now' } as const, 0)
const langMode = atom({ plugin: 'cache-watch', key: 'lang' } as const, null as Lang | null)

/** Settles the panel's language the first time: from settings.language, or the default when the settings do not say. */
const ensureLang = async ($: EngineInterface) => {
  if ((await read($, langMode)) !== null) return

  let language: unknown

  try {
    language = (await $.settings.read()).language
  } catch {
    // No settings to read: the default language.
  }

  await update($, langMode, current => current ?? detectLang(language))
}

/** Whether what another hook drew has nothing to show: no text, no border, nothing inside. */
const isEmpty = (node: RenderNode | null | undefined): boolean => {
  if (node === null || node === undefined) return true
  if (typeof node === 'string') return node === ''
  if (node.type !== 'Box' && node.type !== 'Text') return false
  if (node.props?.borderStyle !== undefined) return false

  return (node.children ?? []).every(isEmpty)
}

/** The one timer that refreshes the countdown, while the cache is hot; a reload starts the module over, without it. */
let ticker: { cancel: () => void } | null = null

const stop = () => {
  ticker?.cancel()
  ticker = null
}

const start = ($: EngineInterface, ttlMs: number) => {
  if (ticker !== null) return

  ticker = $.clock.every(TICK_MS, async () => {
    const at = await read($, lastAt)
    const time = await $.clock.now()

    await update($, now, () => time)

    // Cold: nothing left to count down until the next request starts the timer again.
    if (at === null || statusOf(at, time, ttlMs)?.kind !== 'hot') stop()
  })
}

/** A request of the main thread renews the cache: its time starts over now. */
const touch = async ($: EngineInterface, ttlMs: number) => {
  const time = await $.clock.now()

  await update($, lastAt, () => time)
  await update($, now, () => time)
  start($, ttlMs)
}

export const register: Register = (on, options) => {
  const ttlMs = ttlOf(options.ttl)

  on('session.start', async ($, e, next) => {
    await ensureLang($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await ensureLang($)

    if (e.context.tokens !== undefined) await update($, tokens, () => e.context.tokens ?? null)

    await touch($, ttlMs)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await touch($, ttlMs)

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await ensureLang($)

    if (e.agentId === undefined) await touch($, ttlMs)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stop()
    await update($, lastAt, () => null)
    await update($, tokens, () => null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // What other hooks draw in the band (usage-meter's) stays; this row goes above it.
    const below = await next(e)
    const at = await read($, lastAt)

    if (e.props.hasSurvey || at === null) return below

    const status = statusOf(at, await read($, now), ttlMs)

    if (status === null) return below

    const t = textsOf((await read($, langMode)) ?? DEFAULT_LANG)
    const known = await read($, tokens)
    const { Box, Text } = $.ui.resolve(e)
    const color = status.kind === 'hot' ? COLORS[status.level] : COLORS.cold
    // The terminal draws a gray border around the row; the desktop draws none.
    const frame = e.surface === 'terminal' ? { borderStyle: 'round' as const, borderColor: BORDER_COLOR } : {}

    const row = (
      <Box {...frame} paddingX={1}>
        <Text wrap="truncate-end">
          <Text color={ACCENT}>{'◆ '}</Text>
          <Text bold>{t.label}</Text>
          <Text>{'  '}</Text>
          <Text>{`${EMOJI[status.kind === 'hot' ? status.level : 'cold']} `}</Text>
          {status.kind === 'hot' ? (
            <Text>
              <Text bold color={color}>
                {t.hot}
              </Text>
              <Text dimColor>{` · ${t.coolsIn} `}</Text>
              <Text bold color={color}>
                {countdown(status.leftMs)}
              </Text>
            </Text>
          ) : (
            <Text>
              <Text bold color={color}>
                {t.cold}
              </Text>
              <Text dimColor>{` · ${t.rewrite(known === null ? null : compactTokens(known))}`}</Text>
            </Text>
          )}
        </Text>
      </Box>
    )

    return isEmpty(below) ? row : <Box flexDirection="column">{row}{below}</Box>
  })
}
