import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Покрытие: `npm run coverage` — отчёт в терминал, html (coverage/, вне
    // git) и lcov. Пока в src/ только движок — чистый детерминированный код
    // без DOM, — пол 100 % по всем метрикам. С появлением интерфейса полы
    // пересматриваются решением автора (храповик, как в Dofodo).
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
});
