/**
 * Regras por produto da Hubla: quando uma venda paga de um produto "final" acontece,
 * o lead que já está no funil de origem recebe uma tag e vai para a etapa final.
 */
export type HublaProductRule = {
  id: string;
  /** Casa com o nome do produto vendido (pode ser "Produto A + Produto B"). */
  productPattern: RegExp;
  /** Slug (boards.key) do funil de origem. Correspondência exata, não depende do nome. */
  boardKey: string;
  /** Tag aplicada ao negócio do lead. */
  tag: string;
  /** Etapa de destino: tenta pelo nome; se não achar, usa a última etapa do funil. */
  stagePattern: RegExp;
  /**
   * Funis de origem (slugs) onde o lead pode ter entrado antes de comprar (ex.: ebooks). Se o
   * comprador já tem negócio neles (cruzando e-mail e telefone), o negócio recebe a tag e vai
   * para a etapa final, sem criar negócio novo nem somar valor (evita contar a venda duas vezes).
   */
  attributionBoardKeys?: string[];
};

export const HUBLA_PRODUCT_RULES: HublaProductRule[] = [
  {
    id: 'voce-mamae',
    productPattern: /voc[eê]\s+mam[aã]e/i,
    boardKey: 'detox',
    tag: 'comprou-voce-mamae',
    stagePattern: /virou\s+aluna.*mam[aã]e/i,
  },
  {
    id: 'ciclos',
    productPattern: /\bciclos\b/i,
    boardKey: 'webinario-diario-ciclos',
    tag: 'comprou-ciclos',
    stagePattern: /virou\s+aluna.*ciclos/i,
    attributionBoardKeys: [
      'ebook-chas-inducao',
      'ebook-chas-para-fertilidade',
      'ebook-chas-para-fertilidade-3',
      'ebook-menstruacao',
      'suplemento-ovulo',
    ],
  },
];

export function matchProductRules(productName: string | null): HublaProductRule[] {
  if (!productName) return [];
  return HUBLA_PRODUCT_RULES.filter((r) => r.productPattern.test(productName));
}

export function pickTargetStage(
  stages: { id: string; label: string; order: number }[],
  rule: HublaProductRule,
): string | null {
  if (stages.length === 0) return null;
  const byName = stages.find((s) => rule.stagePattern.test(s.label || ''));
  if (byName) return byName.id;
  return [...stages].sort((a, b) => b.order - a.order)[0].id;
}

export function mergeTags(current: unknown, extra: string[]): string[] {
  const base = Array.isArray(current) ? (current as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  return Array.from(new Set([...base, ...extra]));
}

/** Só dígitos do telefone (ex.: "+55 (87) 98827-6641" → "5587988276641"). */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** Últimos 9 dígitos: ignora DDI/DDD e o "+", permitindo cruzar "+5587988276641" com "87988276641". */
export function phoneTail(phone: string | null | undefined): string | null {
  const d = phoneDigits(phone);
  return d.length >= 9 ? d.slice(-9) : null;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = phoneTail(a);
  const tb = phoneTail(b);
  return !!ta && ta === tb;
}
