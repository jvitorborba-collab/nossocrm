export type StageConversion = {
  /** Negócios que chegaram a esta etapa ou além (etapa atual + todas as seguintes). */
  reached: number;
  /** % em relação à etapa anterior (null na primeira etapa ou quando a anterior é 0). */
  fromPrevious: number | null;
  /** % em relação à primeira etapa (null na primeira etapa ou quando ela é 0). */
  fromFirst: number | null;
};

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10; // 1 casa decimal
}

/**
 * Conversão acumulada do funil. Um negócio só avança, então quem está na etapa N "passou" por
 * todas as anteriores: alcançados(N) = negócios na etapa N + nas seguintes.
 * `counts` = quantidade de negócios hoje em cada etapa, na ordem do funil.
 */
export function computeStageConversion(counts: number[]): StageConversion[] {
  const reached: number[] = new Array(counts.length).fill(0);
  let running = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    running += counts[i] ?? 0;
    reached[i] = running;
  }
  return reached.map((r, i) => ({
    reached: r,
    fromPrevious: i === 0 ? null : pct(r, reached[i - 1]),
    fromFirst: i === 0 ? null : pct(r, reached[0]),
  }));
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
