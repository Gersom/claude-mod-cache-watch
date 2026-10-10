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
