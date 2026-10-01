// Логотип: локомотив стоймя и три поезда — чистый SVG без внешних ресурсов.
import { describe, expect, it } from 'vitest';
import { logoSvg } from '../src/ui/logo';

describe('логотип', () => {
  it('четыре кости по два очка, размер по высоте, класс места', () => {
    const svg = logoSvg(48, 'x');
    expect(svg.startsWith('<svg class="logo x"')).toBe(true);
    expect(svg).toContain('height="48"');
    expect((svg.match(/<rect /g) ?? []).length).toBe(4);
    expect((svg.match(/<circle /g) ?? []).length).toBe(8);
    expect((svg.match(/<line /g) ?? []).length).toBe(4);
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('http');
    expect(logoSvg(20)).toContain('class="logo "');
  });
});
