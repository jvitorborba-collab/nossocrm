import { describe, it, expect } from 'vitest';
import { matchProductRules, pickTargetStage, mergeTags, HUBLA_PRODUCT_RULES, samePhone, phoneTail } from './hubla-rules';

describe('hubla-rules', () => {
  it('casa Você Mamãe, inclusive junto de orderbumps', () => {
    expect(matchProductRules('Programa Você Mamãe')).toHaveLength(1);
    expect(matchProductRules('Programa Voce Mamae + Bump')).toHaveLength(1);
    expect(matchProductRules('Detox para Engravidar')).toHaveLength(0);
    expect(matchProductRules(null)).toHaveLength(0);
  });

  it('casa Ciclos, sozinho ou junto de bumps, sem pegar outros produtos', () => {
    expect(matchProductRules('Ciclos').map((r) => r.id)).toEqual(['ciclos']);
    expect(matchProductRules('Ciclos + Chás poderosos para melhorar a qualidade do óvulo').map((r) => r.id)).toEqual(['ciclos']);
    expect(matchProductRules('Chás poderosos para melhorar a qualidade do óvulo')).toHaveLength(0);
    const ciclos = HUBLA_PRODUCT_RULES.find((r) => r.id === 'ciclos')!;
    const stages = [
      { id: 'a', label: 'Entrou na Aula', order: 0 },
      { id: 'e', label: 'Virou Aluna Ciclos', order: 4 },
    ];
    expect(pickTargetStage(stages, ciclos)).toBe('e');
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

  it('cruza telefones ignorando +, DDI e formatação', () => {
    expect(samePhone('+5587988276641', '5587988276641')).toBe(true);
    expect(samePhone('+55 (87) 98827-6641', '87988276641')).toBe(true);
    expect(samePhone('+5587988276641', '5587988276642')).toBe(false);
    expect(samePhone(null, '5587988276641')).toBe(false);
    expect(phoneTail('123')).toBeNull();
  });

  it('a regra do Ciclos aponta para os funis de ebook', () => {
    const ciclos = HUBLA_PRODUCT_RULES.find((r) => r.id === 'ciclos')!;
    expect(ciclos.attributionBoardKeys).toContain('ebook-menstruacao');
    expect(ciclos.attributionBoardKeys).not.toContain('webinario-diario-ciclos');
  });
});
