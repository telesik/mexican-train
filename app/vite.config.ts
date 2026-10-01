import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** Короткий хэш коммита; «+» в конце — в рабочем дереве есть незакоммиченное. */
function gitHash(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${hash}+` : hash;
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  // Сайт живёт в подкаталоге GitHub Pages — пути к ассетам относительные.
  base: './',
  // Общие модули лежат в подмодуле commons/ рядом с app/ — вне корня Vite;
  // dev-серверу нужно явное разрешение отдавать файлы оттуда.
  server: { fs: { allow: ['..'] } },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __GIT_HASH__: JSON.stringify(gitHash()),
  },
  test: {
    // Покрытие: `npm run coverage` — отчёт в терминал, html (coverage/, вне
    // git) и lcov. Движок — чистый детерминированный код без DOM — покрыт
    // на 100 %; интерфейс проверяется jsdom-тестами вместе с общим каркасом.
    // Полы — «храповик»: двигаются только вверх и только решением автора.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
});
