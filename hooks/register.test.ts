import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never
} as const

const engineBand = { type: 'Box' as const, props: {}, children: [] }

// Settings that say Spanish: the panel is drawn in it.
const spanish = () => ({ value: { language: 'Español' } }) as never

const window = { window: 200000, tokens: 84000, percent: 42 }

const MIN = 60_000

/** The input of a model request of the main loop; with `agentId`, of a subagent's. */
const request = (agentId?: string) => ({ turnId: 't', index: 1, model: 'm', messageCount: 3, agentId })

test('draws nothing until the first response', async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Caché/ })).toBeUndefined()
  await ui.unmount()
})

test('hot after a response: the time left, then cold once the TTL runs out', async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-watch', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /Caché/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /se enfría en/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1:00:00$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Frío/ })).toBeUndefined()
    await ui.unmount()
  }

  await clock.advance(12 * MIN + 48_000)

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /^47:12$/ })).toBeDefined()

  await clock.advance(47 * MIN + 12_000)

  expect(await ui.find({ type: 'Text', text: /Frío/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /la próxima petición reescribirá ~84k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()
  await ui.unmount()
})

test('a 5-minute TTL cools after five minutes, not one hour', { options: { ttl: '5m' } }, async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /^5:00$/ })).toBeDefined()

  await clock.advance(4 * MIN)

  expect(await ui.find({ type: 'Text', text: /^1:00$/ })).toBeDefined()

  await clock.advance(MIN)

  expect(await ui.find({ type: 'Text', text: /Frío/ })).toBeDefined()
  await ui.unmount()
})

test('a request of the main loop renews the cache', { options: { ttl: '5m' } }, async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await clock.advance(4 * MIN)

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /^1:00$/ })).toBeDefined()

  for await (const chunk of $.turn.step(request())) void chunk

  expect(await ui.find({ type: 'Text', text: /^5:00$/ })).toBeDefined()
  await ui.unmount()
})

test('a subagent does not renew the cache', { options: { ttl: '5m' } }, async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await clock.advance(4 * MIN)

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  for await (const chunk of $.turn.step(request('sub-1'))) void chunk

  expect(await ui.find({ type: 'Text', text: /^1:00$/ })).toBeDefined()

  await clock.advance(MIN)

  expect(await ui.find({ type: 'Text', text: /Frío/ })).toBeDefined()
  await ui.unmount()
})

test('cold without a token count leaves the figure out', async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'] })
  await clock.advance(61 * MIN)

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Frío/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /la próxima petición reescribirá la conversación/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tokens/ })).toBeUndefined()
  await ui.unmount()
})

test('speaks English when the settings name no language', async ($, on) => {
  on('ui.render', () => engineBand)
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Cache/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Hot/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cools in/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()

  await clock.advance(61 * MIN)

  expect(await ui.find({ type: 'Text', text: /Cold/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the next request will rewrite ~84k tokens/ })).toBeDefined()
  await ui.unmount()
})

test('speaks the language settings.language names, in any spelling', async ($, on) => {
  on('ui.render', () => engineBand)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'english' } }) as never)
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Hot/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()
  await ui.unmount()
})

test('yields to a survey', async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({
    plugin: 'cache-watch',
    surface: 'terminal',
    ...BAND,
    props: { hasSurvey: true, isWorking: false, maxRows: 10, bodyColumns: 80 } as never
  })

  expect(await ui.find({ type: 'Text', text: /Caché/ })).toBeUndefined()
  await ui.unmount()
})

// Another plugin that draws in the band beneath this one, as usage-meter does.
const other = {
  name: 'other-band',
  tier: 'append' as const,
  register: (on: any) => {
    on('ui.render', { component: 'AbovePrompt' }, () => ({
      type: 'Box',
      props: {},
      children: [{ type: 'Text', props: {}, children: ['OTHER BAND'] }]
    }))
  }
}

test('lives beside another hook of the band: keeps what is below and adds its row', { plugins: [other] }, async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  // Nothing read yet: only the other band draws.
  const before = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await before.find({ type: 'Text', text: /OTHER BAND/ })).toBeDefined()
  expect(await before.find({ type: 'Text', text: /Caché/ })).toBeUndefined()
  await before.unmount()

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /OTHER BAND/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  await ui.unmount()
})

test('leaves a blank line before the band below when the band has room, and none when it is short', { plugins: [other] }, async ($, on) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const gapOf = async (maxRows: number) => {
    const ui = await $.ui.mount({
      plugin: 'cache-watch',
      surface: 'terminal',
      ...BAND,
      props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 80 } as never
    })
    const stack = await ui.find({ type: 'Box', text: /OTHER BAND/ })
    const gap = (stack?.children?.[0] as { props?: { marginBottom?: number } } | undefined)?.props?.marginBottom

    await ui.unmount()

    return gap
  }

  expect(await gapOf(20)).toBe(1)
  expect(await gapOf(10)).toBe(0)
})

/** Observes `$.ui.status`: every text (or `undefined`, the clear) the mod sets, in order. */
const watchStatus = (on: any) => {
  const lines: (string | undefined)[] = []

  on('ui.status', (_: unknown, e: { text: string | undefined }) => {
    lines.push(e.text)

    return { value: undefined }
  })

  return lines
}

/** The texts the mod set, without the clears. */
const texts = (lines: (string | undefined)[]) => lines.filter(line => line !== undefined)

test('panel mode never sets the status line, and clears one left behind', async ($, on) => {
  const lines = watchStatus(on)

  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  expect(texts(lines)).toEqual([])
  // Cleared at most once (the start of the module), never repeated.
  expect(lines.length).toBeLessThanOrEqual(1)
  await ui.unmount()
})

test('status mode sets plain text and draws no row', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(texts(lines).at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
  expect(await ui.find({ type: 'Text', text: /Caché/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()
  await ui.unmount()
})

test('status mode follows the countdown, then goes cold', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const clock = mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await clock.advance(12 * MIN + 48_000)

  expect(texts(lines).at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 47:12')

  await clock.advance(47 * MIN + 12_000)

  expect(texts(lines).at(-1)).toBe('◆ Caché  ⛄ Frío · la próxima petición reescribirá ~84k tokens')
  expect(texts(lines).at(-1)).toContain('Frío')

  // Cold: the timer stops and the line stays as it is.
  const settled = lines.length

  await clock.advance(5 * MIN)

  expect(lines.length).toBe(settled)
})

test('status mode does not repeat a text that did not change', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  expect(texts(lines)).toEqual(['◆ Caché  🔥 Caliente · se enfría en 1:00:00'])
})

test('status mode says nothing before the first response', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('settings.read', spanish)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  mock.clock(on, { now: Date.now() })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  expect(texts(lines)).toEqual([])
})

test('status mode speaks English when the settings name no language', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  expect(texts(lines).at(-1)).toBe('◆ Cache  🔥 Hot · cools in 1:00:00')
})

test('the status line is cleared when the session ends', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  on('settings.read', spanish)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  mock.clock(on, { now: Date.now() })

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  expect(lines.at(-1)).toContain('Caliente')

  await $.session.end({ reason: 'other', sessionId: 's', resume: { id: 's' } })

  expect(lines.at(-1)).toBeUndefined()
  expect(lines.length).toBeGreaterThan(1)
})

/** Runs `/cache-watch` with the arguments the person typed after it (none: ""); resolves its answer. */
const cacheWatch = ($: any, args = '') => $.command.run({ command: 'cache-watch', args })

/**
 * A `$.store` in memory that the test can look into: `mock.store` answers the same way but keeps its entries to itself.
 * Starts with `saved`, what an earlier session left.
 */
const memory = (on: any, saved: Record<string, unknown> = {}) => {
  const entries = new Map(Object.entries(saved))

  on('store.get', (_: unknown, e: { key: string }) => ({ value: entries.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    entries.set(e.key, e.value)

    return { value: undefined }
  })

  return entries
}

test('/cache-watch registers the command when the session starts', async ($, on) => {
  const specs: unknown[] = []

  on('settings.read', spanish)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: unknown) => {
    specs.push(e)

    return { value: { command: 'cache-watch' } } as never
  })
  mock.clock(on, { now: Date.now() })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  expect(specs).toEqual([
    {
      name: 'cache-watch',
      description: 'Cambia la vista del caché entre el panel y la barra de estado.',
      argumentHint: '[panel|status]'
    }
  ])
})

/** The bottom a `/cache-watch` test stands on: Spanish settings, the session's measure, a clock, an empty (or given) store. */
const base = (on: any, saved?: Record<string, unknown>) => {
  on('ui.render', () => engineBand)
  on('settings.read', spanish)
  on('session.measure', ($: unknown, e: { changed: unknown }) => ({ changed: e.changed }))

  return { entries: memory(on, saved), clock: mock.clock(on, { now: Date.now() }) }
}

test('/cache-watch with no argument alternates between panel and status', async ($, on) => {
  const lines = watchStatus(on)

  base(on)
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  // Panel to begin with: the row, no line.
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  expect(texts(lines)).toEqual([])

  expect(await cacheWatch($)).toEqual({ text: 'Caché: vista barra de estado' })
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()
  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')

  expect(await cacheWatch($)).toEqual({ text: 'Caché: vista panel' })
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  expect(lines.at(-1)).toBeUndefined()

  expect(await cacheWatch($, '   ')).toEqual({ text: 'Caché: vista barra de estado' })
  await ui.unmount()
})

test('/cache-watch panel and /cache-watch status pick one, and picking it again changes nothing', async ($, on) => {
  const lines = watchStatus(on)

  base(on)
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  expect(await cacheWatch($, 'status')).toEqual({ text: 'Caché: vista barra de estado' })
  expect(await cacheWatch($, 'status')).toEqual({ text: 'Caché: vista barra de estado' })
  expect(texts(lines)).toEqual(['◆ Caché  🔥 Caliente · se enfría en 1:00:00'])

  expect(await cacheWatch($, 'PANEL')).toEqual({ text: 'Caché: vista panel' })
  expect(await cacheWatch($, ' panel ')).toEqual({ text: 'Caché: vista panel' })
  expect(lines.at(-1)).toBeUndefined()
})

test('/cache-watch with an argument it does not know changes nothing and says the usage', async ($, on) => {
  const lines = watchStatus(on)
  const { entries } = base(on)

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })
  const usage = { text: 'Uso: /cache-watch [panel|status]. Sin argumento, alterna la vista.' }

  expect(await cacheWatch($, 'bar')).toEqual(usage)
  expect(await cacheWatch($, 'status panel')).toEqual(usage)
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  expect(texts(lines)).toEqual([])
  expect(entries.has('display')).toBe(false)

  // And in status it stays there.
  await cacheWatch($, 'status')
  expect(await cacheWatch($, 'nope')).toEqual(usage)
  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
  expect(entries.get('display')).toBe('status')
  await ui.unmount()
})

test('/cache-watch answers in English when the settings name no language', async ($, on) => {
  on('ui.render', () => engineBand)
  memory(on)
  mock.clock(on, { now: Date.now() })

  expect(await cacheWatch($, 'status')).toEqual({ text: 'Cache: status bar view' })
  expect(await cacheWatch($, 'panel')).toEqual({ text: 'Cache: panel view' })
  expect(await cacheWatch($, 'x')).toEqual({ text: 'Usage: /cache-watch [panel|status]. With no argument, it switches the view.' })
})

test('the switch sets and clears the status line at once, and the text comes back after a clear', async ($, on) => {
  const lines = watchStatus(on)
  const { clock } = base(on)

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await clock.advance(12 * MIN + 48_000)

  await cacheWatch($, 'status')
  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 47:12')

  await cacheWatch($, 'panel')
  expect(lines.at(-1)).toBeUndefined()

  // Same second, same text: it must reappear, not be taken for already shown.
  await cacheWatch($, 'status')
  expect(lines.slice(-3)).toEqual([
    '◆ Caché  🔥 Caliente · se enfría en 47:12',
    undefined,
    '◆ Caché  🔥 Caliente · se enfría en 47:12'
  ])

  // The countdown goes on in status, and stops showing once back in panel.
  await clock.advance(MIN)
  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 46:12')

  await cacheWatch($, 'panel')
  await clock.advance(MIN)
  expect(lines.at(-1)).toBeUndefined()
})

test('the switch to status once cold sets the cold text at once', async ($, on) => {
  const lines = watchStatus(on)
  const { clock } = base(on)

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  await clock.advance(61 * MIN)
  await cacheWatch($, 'status')

  expect(lines.at(-1)).toBe('◆ Caché  ⛄ Frío · la próxima petición reescribirá ~84k tokens')
})

test('the switch before the first response draws and sets nothing', async ($, on) => {
  const lines = watchStatus(on)

  base(on)
  await cacheWatch($, 'status')
  expect(texts(lines)).toEqual([])

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })
  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
})

test('the chosen view is saved, and a new session starts from it', async ($, on) => {
  const { entries } = base(on)

  expect(entries.has('display')).toBe(false)

  await cacheWatch($, 'status')
  expect(entries.get('display')).toBe('status')

  await cacheWatch($)
  expect(entries.get('display')).toBe('panel')

  await cacheWatch($)
  expect(entries.get('display')).toBe('status')
})

// A new session is a new test whose store holds what the last one saved.
test('a new session restores the saved view over the option: status over panel', async ($, on) => {
  const lines = watchStatus(on)

  base(on, { display: 'status' })
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()

  // The first `/cache-watch` alternates from what was restored.
  expect(await cacheWatch($)).toEqual({ text: 'Caché: vista panel' })
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  await ui.unmount()
})

test('a new session restores the saved view over the option: panel over status', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  base(on, { display: 'panel' })
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(texts(lines)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeDefined()
  await ui.unmount()
})

test('with nothing saved the display option rules', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)
  const { entries } = base(on)

  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'cache-watch', surface: 'terminal', ...BAND })

  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
  expect(await ui.find({ type: 'Text', text: /Caliente/ })).toBeUndefined()

  // The first alternation goes from the option's view.
  expect(await cacheWatch($)).toEqual({ text: 'Caché: vista panel' })
  expect(entries.get('display')).toBe('panel')
  await ui.unmount()
})

test('a saved value this mod does not know is ignored: the option rules', { options: { display: 'status' } }, async ($, on) => {
  const lines = watchStatus(on)

  base(on, { display: 'status-ansi' })
  await $.session.measure({ context: window, rateLimits: [], changed: ['context'] })

  expect(lines.at(-1)).toBe('◆ Caché  🔥 Caliente · se enfría en 1:00:00')
})
