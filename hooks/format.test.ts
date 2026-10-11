import { describe, expect, test } from 'claude-code/testing'

import {
  TTL_MS,
  compactTokens,
  countdown,
  displayOf,
  knownDisplay,
  levelOf,
  otherDisplay,
  remaining,
  statusOf,
  statusParts,
  statusText,
  ttlOf
} from './format'
import { textsOf } from './i18n'

const HOUR = 3_600_000
const MIN = 60_000

describe('ttlOf', () => {
  test('1h and 5m, and the default for anything else', () => {
    expect(ttlOf('1h')).toBe(HOUR)
    expect(ttlOf('5m')).toBe(5 * MIN)
    expect(ttlOf(undefined)).toBe(HOUR)
    expect(ttlOf('2h')).toBe(HOUR)
    expect(ttlOf(30)).toBe(HOUR)
    expect(TTL_MS['5m']).toBe(300_000)
  })
})

describe('remaining and statusOf', () => {
  test('time left counts down from the last request and stops at zero', () => {
    expect(remaining(1000, 1000, HOUR)).toBe(HOUR)
    expect(remaining(1000, 1000 + 10 * MIN, HOUR)).toBe(50 * MIN)
    expect(remaining(1000, 1000 + HOUR, HOUR)).toBe(0)
    expect(remaining(1000, 1000 + 2 * HOUR, HOUR)).toBe(0)
    // A clock behind the last request never reads more than the TTL.
    expect(remaining(1000, 0, HOUR)).toBe(HOUR)
  })

  test('none before the first request, hot until the TTL runs out, cold from then on', () => {
    expect(statusOf(null, 5000, HOUR)).toBeNull()
    expect(statusOf(0, 59 * MIN, HOUR)).toEqual({ kind: 'hot', leftMs: MIN, level: 'ice' })
    expect(statusOf(0, 30 * MIN, HOUR)).toEqual({ kind: 'hot', leftMs: 30 * MIN, level: 'yellow' })
    expect(statusOf(0, HOUR - 1, HOUR)).toMatchObject({ kind: 'hot', level: 'ice' })
    expect(statusOf(0, HOUR, HOUR)).toEqual({ kind: 'cold' })
    expect(statusOf(0, 3 * HOUR, HOUR)).toEqual({ kind: 'cold' })
  })

  test('the same instant is hot for one hour and cold for five minutes', () => {
    expect(statusOf(0, 10 * MIN, HOUR)?.kind).toBe('hot')
    expect(statusOf(0, 10 * MIN, 5 * MIN)?.kind).toBe('cold')
  })
})

describe('levelOf', () => {
  test('red, orange, yellow, white and ice as the share left drops by fifths', () => {
    expect(levelOf(HOUR, HOUR)).toBe('red')
    expect(levelOf(0.8 * HOUR + 1, HOUR)).toBe('red')
    expect(levelOf(0.8 * HOUR, HOUR)).toBe('orange')
    expect(levelOf(0.6 * HOUR, HOUR)).toBe('yellow')
    expect(levelOf(0.4 * HOUR, HOUR)).toBe('white')
    expect(levelOf(0.2 * HOUR + 1, HOUR)).toBe('white')
    expect(levelOf(0.2 * HOUR, HOUR)).toBe('ice')
    expect(levelOf(1000, HOUR)).toBe('ice')
    expect(levelOf(MIN, 5 * MIN)).toBe('ice')
    expect(levelOf(3 * MIN, 5 * MIN)).toBe('yellow')
  })
})

describe('countdown', () => {
  test('minutes and seconds below an hour, seconds alone below a minute', () => {
    expect(countdown(47 * MIN + 12_000)).toBe('47m 12s')
    expect(countdown(59 * MIN + 3000)).toBe('59m 03s')
    expect(countdown(5 * MIN)).toBe('5m 00s')
    expect(countdown(45_000)).toBe('45s')
    expect(countdown(7000)).toBe('7s')
    expect(countdown(0)).toBe('0s')
    expect(countdown(-5)).toBe('0s')
  })

  test('hours at the edge, seconds rounded up', () => {
    expect(countdown(HOUR)).toBe('1h 00m 00s')
    expect(countdown(HOUR - 1)).toBe('1h 00m 00s')
    expect(countdown(HOUR - 1000)).toBe('59m 59s')
    expect(countdown(61_500)).toBe('1m 02s')
  })
})

describe('compactTokens', () => {
  test('k and M, one decimal at most', () => {
    expect(compactTokens(850)).toBe('850')
    expect(compactTokens(84_000)).toBe('84k')
    expect(compactTokens(1500)).toBe('1.5k')
    expect(compactTokens(84_400)).toBe('84.4k')
    expect(compactTokens(1_000_000)).toBe('1M')
    expect(compactTokens(2_500_000)).toBe('2.5M')
  })
})

describe('displayOf', () => {
  test('panel and status, and the panel for anything else', () => {
    expect(displayOf('panel')).toBe('panel')
    expect(displayOf('status')).toBe('status')
    expect(displayOf(undefined)).toBe('panel')
    expect(displayOf('bar')).toBe('panel')
    expect(displayOf(1)).toBe('panel')
  })

  test('the panel for a removed mode someone may still have saved', () => {
    expect(displayOf('status-ansi')).toBe('panel')
  })
})

describe('knownDisplay and otherDisplay', () => {
  test('the display a value names, or none', () => {
    expect(knownDisplay('panel')).toBe('panel')
    expect(knownDisplay('status')).toBe('status')
    expect(knownDisplay('')).toBeUndefined()
    expect(knownDisplay('Panel')).toBeUndefined()
    expect(knownDisplay(undefined)).toBeUndefined()
    expect(knownDisplay(1)).toBeUndefined()
  })

  test('the other one', () => {
    expect(otherDisplay('panel')).toBe('status')
    expect(otherDisplay('status')).toBe('panel')
  })
})

describe('statusParts and statusText', () => {
  const es = textsOf('es')
  const en = textsOf('en')
  const hot = { kind: 'hot' as const, leftMs: 47 * MIN + 12_000, level: 'orange' as const }

  test('hot: the phrase and the countdown', () => {
    expect(statusParts(hot, es, 84_000)).toEqual({
      emoji: '🔥',
      word: 'Caché caliente',
      value: '47m 12s'
    })
  })

  test('cold: the rewrite note with the tokens, or without them when they are not known', () => {
    expect(statusParts({ kind: 'cold' }, es, 84_000)).toEqual({
      emoji: '⛄',
      word: 'Caché fría',
      note: 'la próxima petición reescribirá ~84k tokens'
    })
    expect(statusParts({ kind: 'cold' }, es, null).note).toBe('la próxima petición reescribirá la conversación')
  })

  test('plain text, one line', () => {
    expect(statusText(statusParts(hot, es, null))).toBe('🔥 Caché caliente · 47m 12s')
    expect(statusText(statusParts({ kind: 'cold' }, es, 84_000))).toBe(
      '⛄ Caché fría · la próxima petición reescribirá ~84k tokens'
    )
    expect(statusText(statusParts(hot, en, null))).toBe('🔥 Hot cache · 47m 12s')
    expect(statusText(statusParts(hot, es, null))).not.toContain('\n')
  })
})
