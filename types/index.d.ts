export type Lang = 'es' | 'en'

declare module 'claude-code' {
  interface PluginState {
    'cache-watch': {
      /** Hora (ms desde la época) de la última petición del hilo principal; null hasta la primera respuesta. */
      lastAt: number | null
      /** Tokens del contexto en la última medición; null si no se conoce. */
      tokens: number | null
      /** Hora (ms) que el panel da por "ahora"; avanza cada segundo mientras el caché está caliente. */
      now: number
      /** Idioma del panel, de settings.language; null hasta leerlo. */
      lang: Lang | null
      /** Vista elegida con `/cache-watch` (o la guardada entre sesiones); null mientras no hay ninguna: manda la opción `display`. */
      display: 'panel' | 'status' | null
    }
  }
}
