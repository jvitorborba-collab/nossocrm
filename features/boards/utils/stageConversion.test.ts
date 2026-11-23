import { describe, it, expect } from 'vitest';
import { computeStageConversion, formatPercent } from './stageConversion';

describe('computeStageConversion', () => {
  it('calcula a conversão acumulada etapa a etapa', () => {
    // 100 na 1ª, 40 na 2ª, 10 na 3ª, 5 na última => alcançados 155, 55, 15, 5
    const r = computeStageConversion([100, 40, 10, 5]);
    expect(r.map((x) => x.reached)).toEqual([155, 55, 15, 5]);
    expect(r[0].fromPrevious).toBeNull();
    expect(r[1].fromPrevious).toBe(35.5);
    expect(r[2].fromPrevious).toBe(27.3);
    expect(r[3].fromPrevious).toBe(33.3);
    expect(r[3].fromFirst).toBe(3.2);
  });

  it('não divide por zero', () => {
    const r = computeStageConversion([0, 0, 3]);
    expect(r[1].fromPrevious).toBe(100);
    expect(computeStageConversion([0, 0])[1].fromPrevious).toBeNull();
    expect(computeStageConversion([])).toEqual([]);
  });

  it('formata em pt-BR', () => {
    expect(formatPercent(35.5)).toBe('35,5%');
    expect(formatPercent(null)).toBe('—');
  });
});
