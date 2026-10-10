import { describe, expect, test } from 'claude-code/testing'

import { TTL_MS, compactTokens, countdown, levelOf, remaining, statusOf, ttlOf } from './format'

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
    expect(statusOf(0, 59 * MIN, HOUR)).toEqual({ kind: 'hot', leftMs: MIN, level: 'yellow' })
    expect(statusOf(0, 30 * MIN, HOUR)).toEqual({ kind: 'hot', leftMs: 30 * MIN, level: 'green' })
    expect(statusOf(0, HOUR - 1, HOUR)).toMatchObject({ kind: 'hot', level: 'yellow' })
    expect(statusOf(0, HOUR, HOUR)).toEqual({ kind: 'cold' })
    expect(statusOf(0, 3 * HOUR, HOUR)).toEqual({ kind: 'cold' })
  })

  test('the same instant is hot for one hour and cold for five minutes', () => {
    expect(statusOf(0, 10 * MIN, HOUR)?.kind).toBe('hot')
    expect(statusOf(0, 10 * MIN, 5 * MIN)?.kind).toBe('cold')
  })
})

describe('levelOf', () => {
  test('yellow at 20 % of the TTL or less, green with more', () => {
    expect(levelOf(HOUR, HOUR)).toBe('green')
    expect(levelOf(0.2 * HOUR + 1, HOUR)).toBe('green')
    expect(levelOf(0.2 * HOUR, HOUR)).toBe('yellow')
    expect(levelOf(1000, HOUR)).toBe('yellow')
    expect(levelOf(MIN, 5 * MIN)).toBe('yellow')
    expect(levelOf(2 * MIN, 5 * MIN)).toBe('green')
  })
})

describe('countdown', () => {
  test('minutes and seconds below an hour', () => {
    expect(countdown(47 * MIN + 12_000)).toBe('47:12')
    expect(countdown(5 * MIN)).toBe('5:00')
    expect(countdown(7000)).toBe('0:07')
    expect(countdown(0)).toBe('0:00')
    expect(countdown(-5)).toBe('0:00')
  })

  test('hours at the edge, seconds rounded up', () => {
    expect(countdown(HOUR)).toBe('1:00:00')
    expect(countdown(HOUR - 1)).toBe('1:00:00')
    expect(countdown(HOUR - 1000)).toBe('59:59')
    expect(countdown(61_500)).toBe('1:02')
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
