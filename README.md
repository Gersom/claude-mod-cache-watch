# cache-watch

Hook para Claude Code que muestra, en una franja sobre el prompt, si el caché de prompts de la sesión está **caliente** o **frío**: «Caché caliente» o «Caché fría».

## Por qué

Claude Code guarda en caché el prompt de la conversación (instrucciones, herramientas, mensajes) para no reenviarlo y volver a procesarlo en cada petición. Ese caché dura un tiempo (el TTL, normalmente 1 hora; 5 minutos en algunos planes) **desde la última petición**: cada petición lo renueva.

- **Caliente:** desde la última petición pasó menos que el TTL. La próxima petición reutiliza el caché y es barata.
- **Frío:** pasó el TTL. La próxima petición reenvía y reescribe toda la conversación como escritura de caché: más tokens, más costo y más consumo del límite del plan.

Con la franja se sabe cuánto falta para que se enfríe y cuánto se reescribiría si se deja enfriar.

## Comportamiento

- Antes de la primera respuesta de la sesión no dibuja nada.
- **Caliente:** `🔥 Caché caliente · se enfría en 47m 12s`, con la cuenta regresiva que baja cada segundo. Formato `45s` por debajo de un minuto, `47m 12s` por debajo de una hora (minutos sin relleno, segundos con dos dígitos) y `1h 00m 00s` desde la hora. La frase «Caché caliente» y la cuenta cambian de color y de emoji a medida que baja el TTL (ver Diseño).
- **Frío:** `⛄ Caché fría · la próxima petición reescribirá ~84k tokens`, en azul claro. La cifra son los tokens del contexto (`context.tokens`) de la última medición, abreviados (`k`, `M`); si no se conocen, se omite y queda «la próxima petición reescribirá la conversación».
- Solo cuentan las peticiones del hilo principal. La actividad de un subagente no renueva el caché y no mueve la cuenta.
- Cede ante una encuesta (`hasSurvey`), igual que usage-meter.
- Dos vistas, que se cambian en vivo con `/cache-watch` (ver «Comando `/cache-watch`»): la fila con borde sobre el prompt (`panel`) o la línea de estado del mod (`status`).
- Casi sin consumo de tokens: observa eventos, dibuja, y solo el comando deja una línea corta en la conversación (ver «Consumo de tokens»).

## Diseño

Una sola línea. Lleva un borde redondeado gris oscuro (`#4b5563`) en todas las superficies (terminal y app de escritorio), y a la derecha, dentro del mismo borde, el botón `[=] Barra de estado` que pasa a la vista `status`:

```
╭────────────────────────────────────────────────────────────────────────────────────╮
│ 🔥 Caché caliente · se enfría en 47m 12s                       [=] Barra de estado │
╰────────────────────────────────────────────────────────────────────────────────────╯

╭────────────────────────────────────────────────────────────────────────────────────╮
│ ⛄ Caché fría · la próxima petición reescribirá ~84k tokens    [=] Barra de estado │
╰────────────────────────────────────────────────────────────────────────────────────╯
```

- **Calor:** según la parte del TTL que queda, toda la frase «Caché caliente» y la cuenta pasan por cinco colores, con su emoji. El emoji no se puede colorear; cambia por etapa:

  | Queda del TTL | Color | Emoji |
  |---|---|---|
  | más del 80 % | rojo `#ef4444` | 🔥 |
  | 60–80 % | naranja `#fb923c` | 🔥 |
  | 40–60 % | amarillo `#facc15` | ☀️ |
  | 20–40 % | blanco `#ffffff` | ☀️ |
  | 20 % o menos (a punto de enfriarse) | celeste claro `#a5f3fc` | ❄️ |
  | frío | azul claro `#93c5fd` | ⛄ |

  La frase «Caché fría» va en azul claro. El texto secundario va atenuado.
- Si no cabe, el texto se corta al final (`…`); nunca pasa a otra línea. El botón conserva su ancho y va atenuado (`Status bar` en inglés).

### Convivencia con usage-meter

Ambos dibujan en la franja sobre el prompt (`AbovePrompt`). cache-watch pide primero lo que dibujan los demás (`next(e)`) y devuelve una columna con su fila arriba y eso debajo (usage-meter, por su parte, se apila bajo lo que haya debajo de él); si no hay nada debajo, devuelve solo su fila. El árbol que entrega `next(e)` es un valor de datos (`RenderElement`), así que se puede meter tal cual como hijo de la columna.

## Opción `ttl`

El TTL se elige en la configuración del mod (`/config`, o `pluginConfigs` en los ajustes):

- `1h` (por defecto)
- `5m`

**Limitación:** el motor no expone a los hooks de plugin ni el TTL real del caché ni la hora de la última respuesta del servidor. Por eso el TTL sale de esta opción y hay que ponerlo a mano según el plan. La hora de la última petición se toma del propio mod, con el reloj de la sesión, en tres momentos del hilo principal: al enviar cada petición (`turn.step`), al medir la sesión (`session.measure`) y al terminar el turno (`turn.complete`). Es una estimación: no ve un caché que el servidor haya vaciado antes de tiempo ni peticiones hechas fuera de esta sesión. Se reinicia al terminar la sesión (`session.end`, también con `/clear`).

## Vistas y opción `display`

El estado se muestra en una de dos vistas:

- `panel` (por defecto): la fila con borde sobre el prompt, descrita en «Diseño».
- `status`: no dibuja la fila; fija la línea de estado del mod (`$.ui.status`, una por plugin, bajo el prompt) con texto plano, sin el «se enfría en»: `🔥 Caché caliente · 47m 12s` o `⛄ Caché fría · la próxima petición reescribirá ~84k tokens`, en el idioma del panel (en inglés, `🔥 Hot cache · 47m 12s`).

La opción `display` (`/config`, o `pluginConfigs` en los ajustes) es solo la **vista inicial por defecto**: la que rige mientras no hayas elegido otra con `/cache-watch`. Qué vista rige al arrancar, por prioridad:

1. La que guardó el comando `/cache-watch` (entre sesiones).
2. La opción `display`.
3. `panel`.

Por eso, si ya elegiste una vista con el comando, cambiar la opción `display` no la altera: vuelve a mandar la opción solo si no hay nada guardado. Para volver a ella, elige con el comando la vista que quieras.

En `status` la línea se actualiza con el mismo temporizador de 1 s que la cuenta, y se borra al terminar la sesión. No se fija antes de la primera respuesta. En `panel` no se fija nada (al arrancar se borra una línea que haya dejado otra vista tras una recarga). La línea de estado no cede ante una encuesta (`hasSurvey`), que solo afecta a la fila.

Se probó un tercer modo con colores ANSI y se descartó: la línea de estado de los mods es texto plano y no admite colores. Un valor guardado que ya no existe (como ese) se ignora y rige la opción; un valor de la opción que ya no existe cae a `panel`.

## Comando `/cache-watch`

Cambia de vista en vivo, sin recargar el mod:

| Comando | Efecto |
|---|---|
| `/cache-watch` | alterna entre `panel` y `status` |
| `/cache-watch panel` | elige el panel |
| `/cache-watch status` | elige la línea de estado |
| `/cache-watch <otra cosa>` | no cambia nada y responde con el uso |

- **Al instante:** al pasar a `panel` se borra la línea de estado y aparece la fila; al pasar a `status` la fila deja de dibujarse y la línea se fija en ese momento, sin esperar al siguiente tic del temporizador. Antes de la primera respuesta de la sesión no hay nada que mostrar en ninguna de las dos.
- **Respuesta:** una línea corta en el idioma del panel (español o inglés, ver «Idioma»): `Caché: vista panel` / `Caché: vista barra de estado`, o `Cache: panel view` / `Cache: status bar view`. Con un argumento desconocido: `Uso: /cache-watch [panel|status]. Sin argumento, alterna la vista.`
- **Botón en el panel:** la fila del panel lleva a la derecha, dentro del borde, el botón `[=] Barra de estado` (`[=] Status bar`), que pasa a la vista `status` igual que `/cache-watch status` (misma línea de estado al instante y misma vista guardada). La vista `status` no tiene botones: la línea de estado es texto plano. De vuelta a `panel` solo con el comando.
- **Se recuerda entre sesiones:** la última vista elegida se guarda en `$.store` (el almacén propio del mod, un JSON bajo el directorio de configuración de Claude Code, clave `display`) y se restaura al arrancar, por encima de la opción `display` (ver «Vistas y opción `display`»). Si el almacén no se puede escribir, la vista cambia igual en la sesión pero no se recuerda. Un valor guardado que el mod no reconoce se ignora.
- **Cómo se aplica:** la vista vigente vive en un estado de la sesión (`$.state`, clave `display`). El hook `ui.render` lo lee, así que un cambio redibuja la franja solo: en `status` no dibuja nada y deja pasar lo de los demás (`next(e)`); en `panel` dibuja la fila. La línea de estado se fija o se borra al mismo tiempo.
- El comando se registra al empezar la sesión (`session.start`), con su descripción en el idioma del panel, y se atiende con un hook `command.run`.

## Idioma

El panel habla español o inglés, con diccionarios fijos en `hooks/i18n.ts`: ningún agente traduce nada, no hay llamadas a modelos y no consume tokens.

- **Automático:** lee `settings.language` (`$.settings.read()`) la primera vez que hay una medición, un turno completo o el inicio de la sesión. Es texto libre, así que reconoce el español en varias formas (`Español`, `spanish`, `es`, `es-MX`, `castellano`, sin importar mayúsculas ni tildes).
- **Por defecto, inglés:** si no hay `settings.language`, no se puede leer o nombra un idioma que el panel no tiene, va en inglés.
- No hay botón ni comando para cambiarlo a mano. Los textos del comando `/cache-watch` van en el mismo idioma.
- **Agregar otro idioma:** un diccionario más en `TEXTS` (`hooks/i18n.ts`), su código en `Lang` (`types/index.d.ts`) y cómo se reconoce en `detectLang`.

Los diagramas de este README están en español.

## Tipo y fuente de datos

- **Tipo:** hook (plugin de Claude Code).
- **Eventos:** `turn.step` (cada petición del modelo; solo la del hilo principal, sin `agentId`), `session.measure` (entrega `context.tokens`), `turn.complete`, `session.start` y `session.end`; `command.run` para `/cache-watch`.
- **Comando y almacén:** `$.command.register` (al empezar la sesión) y `$.store` (`get`/`set` de la clave `display`).
- **Reloj:** `$.clock.now()` para la hora de la última petición y `$.clock.every(1000, …)` para refrescar la cuenta. El temporizador corre solo mientras el caché está caliente y se detiene al enfriarse; una recarga del mod lo descarta.
- **Idioma:** `$.settings.read()`, clave `language`.
- **Dibujo:** hook `ui.render` sobre `AbovePrompt` (vista `panel`) o `$.ui.status` (vista `status`).

## Consumo de tokens

El mod no llama al modelo ni agrega nada al contexto por su cuenta: el manifiesto no declara skills, agentes, comandos ni servidores MCP, y los hooks de eventos solo observan (devuelven `next(e)` sin modificar el evento).

La única excepción es la respuesta de `/cache-watch`: es una línea corta que queda en la conversación como salida del comando, y el modelo la lee con el siguiente mensaje (unos pocos tokens, solo cuando tú ejecutas el comando).

## Fuera de alcance

- Costos o historial de uso.
- Forzar o mantener caliente el caché (no envía peticiones de relleno).
- Alertas o bloqueos.

## Instalación

Requiere Claude Code 2.1.287 o superior. Se instala en un paso (Claude Code 2.1.275 o superior):

```
/plugin install cache-watch --marketplace Gersom/claude-mod-cache-watch
```

O en dos pasos:

```
/plugin marketplace add Gersom/claude-mod-cache-watch
/plugin install cache-watch@cache-watch
```

La instalación pide el valor de `ttl` (`1h` o `5m`) y el de `display` (`panel` o `status`), que es la vista inicial por defecto; después se cambia en vivo con `/cache-watch`.

**En la app de escritorio:**

1. Agregar el marketplace: **Configuración → Plugins → Añadir → Añadir marketplace → Añadir desde un repositorio**, pegar la URL del repo (`https://github.com/Gersom/claude-mod-cache-watch`) y pulsar **Sincronizar**.
2. Encontrar el mod: en **Plugins → Descubrir**, abrir el filtro y elegir **Origen →** `cache-watch`. Ahí aparece `cache-watch` para instalarlo.

Este mod corre con tus permisos, como cualquier plugin; `claude plugin validate` lista los hooks y las llamadas que hace antes de instalarlo.

## Uso

Para desarrollar, cargar el mod desde la carpeta del repo en una sesión de Claude Code (terminal):

```bash
claude --plugin-dir .
```

Probar y validar:

```bash
claude plugin validate .
claude plugin test .
```

## Licencia y apoyo

[MIT](./LICENSE) © Gersom. Si te sirve, puedes apoyar el proyecto con una donación por [PayPal](https://paypal.me/gersomalaja).

## Estructura

```
cache-watch/
├── LICENSE                      # licencia MIT
├── .claude-plugin/
│   ├── plugin.json              # manifiesto del plugin (incluye las opciones ttl y display)
│   └── marketplace.json         # marketplace de un solo plugin (instalación suelta)
├── hooks/
│   ├── hooks.json               # apunta a register.tsx
│   ├── register.tsx             # hooks: session.start, command.run, session.measure, turn.step, turn.complete, session.end, ui.render
│   ├── i18n.ts                  # textos en español e inglés (también los del comando) y detección del idioma
│   ├── format.ts                # lógica pura: estado caliente/frío, restante, cuenta regresiva, color, tokens, texto de la línea de estado, vistas
│   └── *.test.ts                # tests (lógica y render)
└── types/index.d.ts             # contrato del estado ($.state): lastAt, tokens, now, lang y display
```

## Limitaciones conocidas

- El TTL es una opción, no un dato del motor (ver «Opción `ttl`»); si no coincide con el del plan, la cuenta no coincidirá con el caché real.
- **Orden con usage-meter:** desde usage-meter 1.0.x (commit `feat(T-13)`) ambos mods piden primero lo que dibujan los demás (`next(e)`) y se apilan, con cache-watch siempre arriba y usage-meter debajo, sin importar cuál quede primero en la cadena. Con una versión anterior de usage-meter, que no llama a `next(e)`, su recuadro puede tapar la fila de cache-watch: actualiza usage-meter.
- Con la franja muy baja (`maxRows` pequeño) el motor desplaza las últimas filas fuera de vista; la de cache-watch va al final.
- Los tests no cubren el pintado real (colores, bordes) sino la lógica y los hooks bajo cada superficie. De la vista `status` verifican el texto que se pasa a `$.ui.status`, no cómo lo dibuja el motor; del comando, su respuesta, lo que se guarda en un `$.store` en memoria y la línea de estado, no la entrada real del prompt.
