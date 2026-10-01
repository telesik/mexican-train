# Mexican Train Domino Game

A new take on the traditional **Mexican Train** dominoes: a standard 0–6 set
(28 tiles) and **two players**. Rules adapted for the small set; further
variants of the game will live in this same repository as modes of one app.

Новая интерпретация традиционного **«Мексиканского поезда»**: обычный набор
домино 0–6 (28 костей), **два игрока**. Правила адаптированы под малый набор;
будущие варианты игры — режимы этого же приложения в этом же репозитории.

- Rules — [English](docs/RULES.en.md) · [русский](docs/RULES.ru.md) (the
  Russian text is the primary version); more languages will follow.
- Web version — source in `app/` (play against a bot at three levels,
  interface in 11 languages); a hosted version is coming soon. To run it
  locally: `cd app && npm install && npm run dev`.
- Mobile app (iOS / Android) — separate private repository.
- Shared code of telesik domino games — git submodule `commons/`
  ([telesik-web-commons](https://github.com/telesik/telesik-web-commons));
  clone with `git clone --recurse-submodules` or run `git submodule update --init`.

Mexican Train is a traditional game (first published in 1994; many editions
since). This project is an independent interpretation; it is not affiliated
with any publisher of physical sets. The rules text and the web application
here are original work.

Licence: [CC BY 4.0](LICENSE.md) · Author: **Alexey Kiselyov**.
