import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_LANG, TEXTS, detectLang, textsOf } from './i18n'

const es = TEXTS.es
const en = TEXTS.en

describe('detectLang', () => {
  test('Spanish, however the setting names it', () => {
    for (const value of ['Español', 'español', 'ESPAÑOL', 'Spanish', 'spanish', 'es', 'es-MX', 'es_ES', 'Castellano', ' spanish (Spain) ']) {
      expect(detectLang(value)).toBe('es')
    }
  })

  test('English, and any language the panel does not have, give English', () => {
    for (const value of ['English', 'english', 'en', 'en-US', 'japanese', 'french', 'Estonian', 'português', 'esperanto']) {
      expect(detectLang(value)).toBe('en')
    }
  })

  test('no setting, or one that is not text, gives the default: English', () => {
    expect(DEFAULT_LANG).toBe('en')
    expect(detectLang(undefined)).toBe('en')
    expect(detectLang(null)).toBe('en')
    expect(detectLang(42)).toBe('en')
    expect(detectLang('')).toBe('en')
    expect(detectLang('   ')).toBe('en')
  })
})

describe('texts', () => {
  test('each language has its own texts, and a word for everything', () => {
    expect(textsOf('es')).toBe(es)
    expect(textsOf('en')).toBe(en)
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  test('the rewrite warning carries the tokens, or leaves the figure out', () => {
    expect(es.rewrite('84k')).toBe('la próxima petición reescribirá ~84k tokens')
    expect(en.rewrite('84k')).toBe('the next request will rewrite ~84k tokens')
    expect(es.rewrite(null)).not.toMatch(/~|tokens/)
    expect(en.rewrite(null)).not.toMatch(/~|tokens/)
  })
})
