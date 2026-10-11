import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Lang } from '../types'
import type { Display } from './format'
import {
  COLORS,
  EMOJI,
  compactTokens,
  countdown,
  displayOf,
  knownDisplay,
  otherDisplay,
  statusOf,
  statusParts,
  statusText,
  ttlOf
} from './format'
import { DEFAULT_LANG, detectLang, textsOf } from './i18n'

const BORDER_COLOR = '#4b5563'

const TICK_MS = 1000
/** The key of `$.store` that keeps the view `/cache-watch` chose, between sessions. */
const STORE_KEY = 'display'

const lastAt = atom({ plugin: 'cache-watch', key: 'lastAt' } as const, null as number | null)
const tokens = atom({ plugin: 'cache-watch', key: 'tokens' } as const, null as number | null)
const now = atom({ plugin: 'cache-watch', key: 'now' } as const, 0)
const langMode = atom({ plugin: 'cache-watch', key: 'lang' } as const, null as Lang | null)
/** The view chosen with `/cache-watch` (or restored from the store); `null` while none: the `display` option rules. */
const chosen = atom({ plugin: 'cache-watch', key: 'display' } as const, null as Display | null)

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

/** The one restore of the saved view per load of the module (a reload starts it over); shared, so no event reads the view before it ends. */
let restoring: Promise<void> | null = null

/** Puts the view saved by `/cache-watch` in `$.store` into the atom, unless it already holds one; a store that cannot be read leaves the option to rule. */
const ensureView = ($: EngineInterface) => {
  restoring ??= (async () => {
    let saved: Display | undefined

    try {
      saved = knownDisplay(await $.store.get(STORE_KEY))
    } catch {
      // No store to read: the option's view.
    }

    if (saved !== undefined) await update($, chosen, current => current ?? saved)
  })()

  return restoring
}

/** The view now: what the command chose or the store kept, else the `display` option's (`initial`). */
const viewOf = async ($: EngineInterface, initial: Display) => {
  await ensureView($)

  return (await read($, chosen)) ?? initial
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

/** The last text handed to `$.ui.status`: `null` until the module has set it (or cleared it) once, as a reload leaves a line behind. */
let pushed: string | undefined | null = null

/** Sets the status line, or clears it with `undefined`; nothing is sent when it already says that. */
const setStatus = ($: EngineInterface, text: string | undefined) => {
  if (text === pushed) return

  pushed = text
  $.ui.status(text)
}

/** The status line follows the view: the cache's text in `status`, no line at all in `panel`. `initial` is the option's view. */
const refreshStatus = async ($: EngineInterface, ttlMs: number, initial: Display) => {
  if ((await viewOf($, initial)) === 'panel') return setStatus($, undefined)

  await ensureLang($)

  const at = await read($, lastAt)
  const status = at === null ? null : statusOf(at, await read($, now), ttlMs)

  if (status === null) return setStatus($, undefined)

  const t = textsOf((await read($, langMode)) ?? DEFAULT_LANG)

  setStatus($, statusText(statusParts(status, t, await read($, tokens))))
}

/** Switches to the view: the atom, the store and the status line, as `/cache-watch` and the panel's button do. */
const setView = async ($: EngineInterface, view: Display, ttlMs: number, initial: Display) => {
  const time = await $.clock.now()

  await update($, chosen, () => view)

  try {
    await $.store.set(STORE_KEY, view)
  } catch {
    // Not saved: the view still changes for this session.
  }

  // The line shows (or goes) at once, with the time as it is now, not as the last tick left it.
  await update($, now, () => time)
  await refreshStatus($, ttlMs, initial)
}

const start = ($: EngineInterface, ttlMs: number, initial: Display) => {
  if (ticker !== null) return

  ticker = $.clock.every(TICK_MS, async () => {
    const at = await read($, lastAt)
    const time = await $.clock.now()

    await update($, now, () => time)
    await refreshStatus($, ttlMs, initial)

    // Cold: nothing left to count down until the next request starts the timer again.
    if (at === null || statusOf(at, time, ttlMs)?.kind !== 'hot') stop()
  })
}

/** A request of the main thread renews the cache: its time starts over now. */
const touch = async ($: EngineInterface, ttlMs: number, initial: Display) => {
  const time = await $.clock.now()

  // The saved view first, so the first row is never drawn in the wrong one.
  await ensureView($)
  await update($, lastAt, () => time)
  await update($, now, () => time)
  await refreshStatus($, ttlMs, initial)
  start($, ttlMs, initial)
}

export const register: Register = (on, options) => {
  const ttlMs = ttlOf(options.ttl)
  // The view when nothing was chosen with `/cache-watch`: the option's.
  const initial = displayOf(options.display)

  on('session.start', async ($, e, next) => {
    await ensureLang($)
    // In `panel` this clears a line a previous mode (before a reload) may have left.
    await refreshStatus($, ttlMs, initial)

    await $.command.register({
      name: 'cache-watch',
      description: textsOf((await read($, langMode)) ?? DEFAULT_LANG).commandDescription,
      argumentHint: '[panel|status]'
    })

    return next(e)
  })

  // `/cache-watch` switches the view; with no argument it alternates, with `panel` or `status` it picks one.
  on('command.run', { command: 'cache-watch' }, async ($, e) => {
    await ensureLang($)

    const t = textsOf((await read($, langMode)) ?? DEFAULT_LANG)
    const arg = e.args.trim().toLowerCase()
    const asked = knownDisplay(arg)

    if (arg !== '' && asked === undefined) return { text: t.usage }

    const view = asked ?? otherDisplay(await viewOf($, initial))

    await setView($, view, ttlMs, initial)

    return { text: t.viewIs(view) }
  })

  on('session.measure', async ($, e, next) => {
    await ensureLang($)

    if (e.context.tokens !== undefined) await update($, tokens, () => e.context.tokens ?? null)

    await touch($, ttlMs, initial)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await touch($, ttlMs, initial)

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await ensureLang($)

    if (e.agentId === undefined) await touch($, ttlMs, initial)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stop()
    await update($, lastAt, () => null)
    await update($, tokens, () => null)
    setStatus($, undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The `status` view draws nothing here: the line is the mod's status. The atom is read while drawing, so a switch redraws.
    if (((await read($, chosen)) ?? initial) !== 'panel') return next(e)

    // What other hooks draw in the band (usage-meter's) stays; this row goes above it.
    const below = await next(e)
    const at = await read($, lastAt)

    if (e.props.hasSurvey || at === null) return below

    const status = statusOf(at, await read($, now), ttlMs)

    if (status === null) return below

    const t = textsOf((await read($, langMode)) ?? DEFAULT_LANG)
    const known = await read($, tokens)
    const { Box, Button, Text } = $.ui.resolve(e)
    const color = status.kind === 'hot' ? COLORS[status.level] : COLORS.cold
    const frame = { borderStyle: 'round' as const, borderColor: BORDER_COLOR }

    const row = (
      <Box {...frame} paddingX={1}>
        <Box flexGrow={1} justifyContent="space-between">
          <Text wrap="truncate-end">
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
          {/* The way to the status line; back to the panel only with the command. */}
          <Box flexShrink={0} marginLeft={2}>
            <Button key="status" plain dimColor onPress={() => void setView($, 'status', ttlMs, initial)}>
              {`[=] ${t.toStatus}`}
            </Button>
          </Box>
        </Box>
      </Box>
    )

    if (isEmpty(below)) return row

    // The desktop page draws the two bordered boxes touching; a blank spacer row parts them. The terminal's band is short on rows and already reads well.
    return (
      <Box flexDirection="column">
        {row}
        {e.surface === 'desktop' ? <Box height={1} /> : null}
        {below}
      </Box>
    )
  })
}
