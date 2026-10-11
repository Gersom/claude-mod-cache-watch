import type { Lang } from '../types'

/** Every word the panel writes itself, in one language. */
export type Texts = {
  lang: Lang
  /** `Caché caliente` (`Hot cache`). */
  hot: string
  /** `Caché fría` (`Cold cache`). */
  cold: string
  /** `se enfría en 47m 12s` (`cools in 47m 12s`): what comes before the countdown. */
  coolsIn: string
  /** `la próxima petición reescribirá ~84k tokens`; without the figure when the tokens are not known. */
  rewrite: (tokens: string | null) => string
  /** The one line the typeahead shows for `/cache-watch`. */
  commandDescription: string
  /** `Caché: vista panel` (`Cache: panel view`): what `/cache-watch` answers once the view is the display's. */
  viewIs: (display: 'panel' | 'status') => string
  /** What `/cache-watch` answers to an argument it does not know. */
  usage: string
}

/** The language the panel speaks when settings.language names none it knows. */
export const DEFAULT_LANG: Lang = 'en'

export const TEXTS: Record<Lang, Texts> = {
  es: {
    lang: 'es',
    hot: 'Caché caliente',
    cold: 'Caché fría',
    coolsIn: 'se enfría en',
    rewrite: tokens =>
      tokens === null
        ? 'la próxima petición reescribirá la conversación'
        : `la próxima petición reescribirá ~${tokens} tokens`,
    commandDescription: 'Cambia la vista del caché entre el panel y la barra de estado.',
    viewIs: display => `Caché: vista ${display === 'panel' ? 'panel' : 'barra de estado'}`,
    usage: 'Uso: /cache-watch [panel|status]. Sin argumento, alterna la vista.'
  },
  en: {
    lang: 'en',
    hot: 'Hot cache',
    cold: 'Cold cache',
    coolsIn: 'cools in',
    rewrite: tokens =>
      tokens === null
        ? 'the next request will rewrite the conversation'
        : `the next request will rewrite ~${tokens} tokens`,
    commandDescription: 'Switch the cache view between the panel and the status bar.',
    viewIs: display => `Cache: ${display === 'panel' ? 'panel' : 'status bar'} view`,
    usage: 'Usage: /cache-watch [panel|status]. With no argument, it switches the view.'
  }
}

export const textsOf = (lang: Lang) => TEXTS[lang]

/** The first word of the setting's value in lowercase letters, accents and case gone: `Español` is `espanol`. */
const firstWord = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .find(word => word !== '') ?? ''

const SPANISH = ['es', 'esp', 'spa', 'spanish', 'espanol', 'castellano']

/**
 * The panel's language for the value of `settings.language` (free text: `spanish`, `Español`, `es-MX`...).
 * Spanish when it names Spanish; any other value, or none, gives the default, English.
 */
export const detectLang = (language: unknown): Lang =>
  typeof language === 'string' && SPANISH.includes(firstWord(language)) ? 'es' : DEFAULT_LANG
