import { describe, it, expect } from 'vitest';
import { matchProductRules, pickTargetStage, mergeTags, HUBLA_PRODUCT_RULES } from './hubla-rules';

describe('hubla-rules', () => {
  it('casa Você Mamãe, inclusive junto de orderbumps', () => {
    expect(matchProductRules('Programa Você Mamãe')).toHaveLength(1);
    expect(matchProductRules('Programa Voce Mamae + Bump')).toHaveLength(1);
    expect(matchProductRules('Detox para Engravidar')).toHaveLength(0);
    expect(matchProductRules(null)).toHaveLength(0);
  });

  it('escolhe a etapa pelo nome e cai na última se não achar', () => {
    const rule = HUBLA_PRODUCT_RULES[0];
    const stages = [
      { id: 'a', label: 'Novo', order: 0 },
      { id: 'b', label: 'Virou Aluna Você Mamãe', order: 5 },
      { id: 'c', label: 'Outra', order: 9 },
    ];
    expect(pickTargetStage(stages, rule)).toBe('b');
    expect(pickTargetStage(stages.filter((s) => s.id !== 'b'), rule)).toBe('c');
    expect(pickTargetStage([], rule)).toBeNull();
  });

  it('mescla tags sem duplicar', () => {
    expect(mergeTags(['Hubla'], ['comprou-voce-mamae', 'Hubla'])).toEqual(['Hubla', 'comprou-voce-mamae']);
    expect(mergeTags(null, ['x'])).toEqual(['x']);
  });
});
