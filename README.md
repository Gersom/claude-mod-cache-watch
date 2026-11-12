English | [Español](./README.es.md)

# cache-watch

Claude Code hook that shows, in a strip above the prompt, whether the session's prompt cache is **hot** or **cold**: "Hot cache" or "Cold cache".

## Why

Claude Code caches the conversation prompt (instructions, tools, messages) so it does not have to resend and reprocess it on every request. That cache lasts for a while (the TTL, normally 1 hour; 5 minutes on some plans) **from the last request**: every request renews it.

- **Hot:** less than the TTL has passed since the last request. The next request reuses the cache and is cheap.
- **Cold:** the TTL has passed. The next request resends and rewrites the whole conversation as a cache write: more tokens, more cost and more use of the plan limit.

The strip tells you how long is left before it cools and how much would be rewritten if you let it cool.

## Behavior

- Before the session's first response, it draws nothing.
- **Hot:** `🔥 Hot cache · cools in 47m 12s · if cold, rewrites ~84k`, with the countdown ticking down every second. The end ("if cold, rewrites ~84k") is the tokens that would be rewritten if the cache cools, the same ones from the context that the cold state uses; it only appears if they are known, and if not the row stays as before (`🔥 Hot cache · cools in 47m 12s`). Format `45s` below one minute, `47m 12s` below one hour (minutes without padding, seconds with two digits) and `1h 00m 00s` from one hour on. The phrase "Hot cache" and the countdown change color and emoji as the TTL runs down (see Design).
- **Cold:** `⛄ Cold cache · the next request will rewrite ~84k tokens`, in light blue. The figure is the context tokens (`context.tokens`) from the last measurement, abbreviated (`k`, `M`); if they are not known, it is omitted and what is left is "the next request will rewrite the conversation".
- Only requests from the main thread count. A subagent's activity does not renew the cache and does not move the countdown.
- It yields to a survey (`hasSurvey`), just like usage-meter.
- Two views, switched live with `/cache-watch` (see "`/cache-watch` command"): the bordered row above the prompt (`panel`) or the mod's status line (`status`).
- Almost no token use: it observes events, draws, and only the command leaves a short line in the conversation (see "Token use").

## Design

A single line. It has a dark gray (`#4b5563`) rounded border on every surface (terminal and desktop app), and on the right, inside the same border, the `[=] Status bar` button that switches to the `status` view:

```
╭───────────────────────────────────────────────────────────────────────────╮
│ 🔥 Hot cache · cools in 47m 12s · if cold, rewrites ~84k   [=] Status bar │
╰───────────────────────────────────────────────────────────────────────────╯

╭───────────────────────────────────────────────────────────────────────────╮
│ ⛄ Cold cache · the next request will rewrite ~84k tokens  [=] Status bar │
╰───────────────────────────────────────────────────────────────────────────╯
```

- **Heat:** depending on the part of the TTL that is left, the whole phrase "Hot cache" and the countdown go through five colors, each with its emoji. The emoji cannot be colored; it changes by stage:

  | TTL left | Color | Emoji |
  |---|---|---|
  | more than 80 % | red `#ef4444` | 🔥 |
  | 60–80 % | orange `#fb923c` | 🔥 |
  | 40–60 % | yellow `#facc15` | ☀️ |
  | 20–40 % | white `#ffffff` | ☀️ |
  | 20 % or less (about to cool) | light cyan `#a5f3fc` | ❄️ |
  | cold | light blue `#93c5fd` | ⛄ |

  The phrase "Cold cache" is in light blue. The secondary text is dimmed.
- **Narrow width:** if the full text plus the button do not fit in the strip's width (minus 4 columns of border and padding; the emoji counts as 2), the hot row trims in this order:
  1. First it omits the end "if cold, rewrites ~84k" (in terminal and in desktop): what is left is `🔥 Hot cache · cools in 59m 03s`.
  2. If it still does not fit, only in terminal it also omits "cools in": what is left is `🔥 Hot cache · 59m 03s`. In the desktop app "cools in" is never omitted; when cold there is nothing of this to omit.
  3. If it still does not fit, the text is cut at the end (`…`); it never wraps onto another line.
- The end is dimmed, like the rest of the secondary text.
- The button keeps its width and is dimmed (`Barra de estado` in Spanish).

### Coexistence with usage-meter

Both draw in the strip above the prompt (`AbovePrompt`). cache-watch first asks for what the others draw (`next(e)`) and returns a column with its row on top and that below (usage-meter, for its part, stacks itself under whatever is below it); if there is nothing below, it returns only its row. The tree that `next(e)` hands over is a data value (`RenderElement`), so it can be put as-is as a child of the column.

## `ttl` option

The TTL is chosen in the mod's settings (`/config`, or `pluginConfigs` in the settings):

- `1h` (default)
- `5m`

**Limitation:** the engine does not expose to plugin hooks either the cache's real TTL or the time of the server's last response. That is why the TTL comes from this option and has to be set by hand according to the plan. The time of the last request is taken from the mod itself, with the session clock, at three moments of the main thread: when each request is sent (`turn.step`), when the session is measured (`session.measure`) and when the turn ends (`turn.complete`). It is an estimate: it does not see a cache that the server emptied early, nor requests made outside this session. It resets when the session ends (`session.end`, also with `/clear`).

## Views and the `display` option

The state is shown in one of two views:

- `panel` (default): the bordered row above the prompt, described in "Design".
- `status`: it does not draw the row; it sets the mod's status line (`$.ui.status`, one per plugin, below the prompt) with plain text, without the "cools in": `🔥 Hot cache · 47m 12s · ~84k at stake` or `⛄ Cold cache · the next request will rewrite ~84k tokens`, in the panel's language (in Spanish, `🔥 Caché caliente · 47m 12s · ~84k en juego`). The "~84k at stake" is the tokens that would be rewritten if the cache cools; the line does not know the width, so it includes it whenever the tokens are known (if not, what is left is `🔥 Hot cache · 47m 12s`). When cold it does not change.

The `display` option (`/config`, or `pluginConfigs` in the settings) is only the **default initial view**: the one that rules as long as you have not picked another with `/cache-watch`. Which view rules at startup, by priority:

1. The one the `/cache-watch` command saved (between sessions).
2. The `display` option.
3. `panel`.

That is why, if you already picked a view with the command, changing the `display` option does not alter it: the option rules again only if nothing is saved. To go back to it, pick the view you want with the command.

In `status` the line is updated with the same 1 s timer as the countdown, and it is cleared when the session ends. It is not set before the first response. In `panel` nothing is set (at startup, a line left behind by another view after a reload is cleared). The status line does not yield to a survey (`hasSurvey`), which only affects the row.

A third mode with ANSI colors was tried and discarded: the mods' status line is plain text and does not support colors. A saved value that no longer exists (like that one) is ignored and the option rules; an option value that no longer exists falls back to `panel`.

## `/cache-watch` command

Switches the view live, without reloading the mod:

| Command | Effect |
|---|---|
| `/cache-watch` | toggles between `panel` and `status` |
| `/cache-watch panel` | picks the panel |
| `/cache-watch status` | picks the status line |
| `/cache-watch <anything else>` | changes nothing and answers with the usage |

- **Instantly:** when switching to `panel` the status line is cleared and the row appears; when switching to `status` the row stops being drawn and the line is set at that moment, without waiting for the timer's next tick. Before the session's first response there is nothing to show in either.
- **Response:** a short line in the panel's language (Spanish or English, see "Language"): `Cache: panel view` / `Cache: status bar view`, or `Caché: vista panel` / `Caché: vista barra de estado`. With an unknown argument: `Usage: /cache-watch [panel|status]. With no argument, it switches the view.`
- **Button in the panel:** the panel row carries on the right, inside the border, the `[=] Status bar` button (`[=] Barra de estado`), which switches to the `status` view just like `/cache-watch status` (same status line instantly and same saved view). The `status` view has no buttons: the status line is plain text. Back to `panel` only with the command.
- **Remembered between sessions:** the last view picked is saved in `$.store` (the mod's own store, a JSON under Claude Code's configuration directory, key `display`) and restored at startup, above the `display` option (see "Views and the `display` option"). If the store cannot be written, the view changes anyway within the session but is not remembered. A saved value that the mod does not recognize is ignored.
- **How it is applied:** the current view lives in a session state (`$.state`, key `display`). The `ui.render` hook reads it, so a change redraws the strip by itself: in `status` it draws nothing and lets what the others draw through (`next(e)`); in `panel` it draws the row. The status line is set or cleared at the same time.
- The command is registered when the session starts (`session.start`), with its description in the panel's language, and is handled with a `command.run` hook.

## Language

The panel speaks Spanish or English, with fixed dictionaries in `hooks/i18n.ts`: no agent translates anything, there are no calls to models and it uses no tokens.

- **Automatic:** it reads `settings.language` (`$.settings.read()`) the first time there is a measurement, a completed turn or the session start. It is free text, so it recognizes Spanish in several forms (`Español`, `spanish`, `es`, `es-MX`, `castellano`, regardless of case or accents).
- **English by default:** if there is no `settings.language`, it cannot be read or it names a language the panel does not have, it goes in English.
- There is no button or command to change it by hand. The texts of the `/cache-watch` command go in the same language.
- **Adding another language:** one more dictionary in `TEXTS` (`hooks/i18n.ts`), its code in `Lang` (`types/index.d.ts`) and how it is recognized in `detectLang`.

The diagrams in this README are in English.

## Type and data source

- **Type:** hook (Claude Code plugin).
- **Events:** `turn.step` (each model request; only the main thread's, without `agentId`), `session.measure` (delivers `context.tokens`), `turn.complete`, `session.start` and `session.end`; `command.run` for `/cache-watch`.
- **Command and store:** `$.command.register` (when the session starts) and `$.store` (`get`/`set` of the `display` key).
- **Clock:** `$.clock.now()` for the time of the last request and `$.clock.every(1000, …)` to refresh the countdown. The timer runs only while the cache is hot and stops when it cools; a mod reload discards it.
- **Language:** `$.settings.read()`, key `language`.
- **Drawing:** `ui.render` hook on `AbovePrompt` (`panel` view) or `$.ui.status` (`status` view).

## Token use

The mod does not call the model or add anything to the context on its own: the manifest declares no skills, agents, commands or MCP servers, and the event hooks only observe (they return `next(e)` without modifying the event).

The only exception is the `/cache-watch` response: it is a short line that stays in the conversation as the command's output, and the model reads it with the next message (a few tokens, only when you run the command).

## Out of scope

- Costs or usage history.
- Forcing the cache or keeping it hot (it does not send filler requests).
- Alerts or blocks.

## Installation

Requires Claude Code 2.1.287 or later. It installs in one step (Claude Code 2.1.275 or later):

```
/plugin install cache-watch --marketplace Gersom/claude-mod-cache-watch
```

Or in two steps:

```
/plugin marketplace add Gersom/claude-mod-cache-watch
/plugin install cache-watch@cache-watch
```

The installation asks for the value of `ttl` (`1h` or `5m`) and that of `display` (`panel` or `status`), which is the default initial view; afterwards it is changed live with `/cache-watch`.

**In the desktop app:**

1. Add the marketplace: **Settings → Plugins → Add → Add marketplace → Add from a repository**, paste the repo's URL (`https://github.com/Gersom/claude-mod-cache-watch`) and click **Sync**.
2. Find the mod: in **Plugins → Discover**, open the filter and choose **Source →** `cache-watch`. `cache-watch` appears there to install it.

This mod runs with your permissions, like any plugin; `claude plugin validate` lists the hooks and the calls it makes before you install it.

## Usage

To develop, load the mod from the repo's folder in a Claude Code session (terminal):

```bash
claude --plugin-dir .
```

Test and validate:

```bash
claude plugin validate .
claude plugin test .
```

## License and support

[MIT](./LICENSE) © Gersom. If it is useful to you, you can support the project with a donation via [PayPal](https://paypal.me/gersomalaja).

## Structure

```
cache-watch/
├── LICENSE                      # MIT license
├── .claude-plugin/
│   ├── plugin.json              # plugin manifest (includes the ttl and display options)
│   └── marketplace.json         # single-plugin marketplace (standalone install)
├── hooks/
│   ├── hooks.json               # points to register.tsx
│   ├── register.tsx             # hooks: session.start, command.run, session.measure, turn.step, turn.complete, session.end, ui.render
│   ├── i18n.ts                  # Spanish and English texts (the command's too) and language detection
│   ├── format.ts                # pure logic: hot/cold state, time left, countdown, color, tokens, status line text, views
│   └── *.test.ts                # tests (logic and render)
└── types/index.d.ts             # state contract ($.state): lastAt, tokens, now, lang and display
```

## Known limitations

- The TTL is an option, not data from the engine (see "`ttl` option"); if it does not match the plan's, the countdown will not match the real cache.
- **Order with usage-meter:** since usage-meter 1.0.x (commit `feat(T-13)`) both mods first ask for what the others draw (`next(e)`) and stack, with cache-watch always on top and usage-meter below, no matter which comes first in the chain. With an older usage-meter version, which does not call `next(e)`, its box may cover cache-watch's row: update usage-meter.
- With a very short strip (small `maxRows`) the engine scrolls the last rows out of view; cache-watch's is at the end.
- The tests do not cover the real painting (colors, borders) but the logic and the hooks under each surface. For the `status` view they check the text passed to `$.ui.status`, not how the engine draws it; for the command, its response, what is saved in an in-memory `$.store` and the status line, not the real prompt input.
