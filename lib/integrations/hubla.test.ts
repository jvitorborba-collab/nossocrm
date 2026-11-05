import { describe, it, expect } from 'vitest';
import { parseHublaEvent } from './hubla';

const base = (type: string, status?: string) => ({
  type,
  event: {
    product: { id: 'p1', name: 'Programa X' },
    invoice: {
      id: 'inv-1',
      status,
      paymentMethod: 'credit_card',
      amount: { totalCents: 112320, total: 1123.2 },
      payer: { firstName: 'John', lastName: 'Doe', email: 'John@Example.com', phone: '+5511999999999' },
    },
    user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '+5511999999999' },
  },
  version: '2.0.0',
});

describe('parseHublaEvent', () => {
  it('payment_succeeded vira won, com valor em reais e e-mail normalizado', () => {
    const r = parseHublaEvent(base('invoice.payment_succeeded'));
    expect(r).toMatchObject({ outcome: 'won', amount: 1123.2, buyerEmail: 'john@example.com', buyerName: 'John Doe' });
  });

  it('status_updated paid e payment_succeeded geram a mesma chave de dedupe', () => {
    const a = parseHublaEvent(base('invoice.payment_succeeded'));
    const b = parseHublaEvent(base('invoice.status_updated', 'paid'));
    expect(a?.dedupeKey).toBe(b?.dedupeKey);
  });

  it('mapeia perdas e reembolsos', () => {
    expect(parseHublaEvent(base('invoice.payment_failed'))?.outcome).toBe('lost');
    expect(parseHublaEvent(base('invoice.expired'))?.outcome).toBe('lost');
    expect(parseHublaEvent(base('invoice.refunded'))?.outcome).toBe('refunded');
    expect(parseHublaEvent(base('invoice.status_updated', 'refunded'))?.outcome).toBe('refunded');
  });

  it('junta produto principal e orderbumps no nome', () => {
    const b: any = base('invoice.payment_succeeded');
    b.event.products = [{ id: 'p1', name: 'Programa X' }, { id: 'p2', name: 'Bump Y' }];
    expect(parseHublaEvent(b)?.productName).toBe('Programa X + Bump Y');
  });

  it('ignora eventos desconhecidos e payloads inválidos', () => {
    expect(parseHublaEvent(base('subscription.created'))).toBeNull();
    expect(parseHublaEvent(base('invoice.status_updated', 'pending'))).toBeNull();
    expect(parseHublaEvent(null)).toBeNull();
    expect(parseHublaEvent({ type: 'invoice.payment_succeeded', event: {} })).toBeNull();
  });
});
