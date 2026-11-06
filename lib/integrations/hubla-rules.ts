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
};

export const HUBLA_PRODUCT_RULES: HublaProductRule[] = [
  {
    id: 'voce-mamae',
    productPattern: /voc[eê]\s+mam[aã]e/i,
    boardKey: 'detox',
    tag: 'comprou-voce-mamae',
    stagePattern: /virou\s+aluna.*mam[aã]e/i,
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
