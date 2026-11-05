/**
 * Interpretação de webhooks da Hubla (eventos v2.0.0).
 *
 * Doc: https://hubla.gitbook.io/docs/webhooks
 * Auth: header `x-hubla-token` (comparado ao env HUBLA_WEBHOOK_TOKEN).
 *
 * A Hubla dispara um evento específico (ex.: invoice.payment_succeeded) E também
 * `invoice.status_updated` para a mesma transição. Para não processar duas vezes,
 * ambos são reduzidos a um mesmo "outcome" e o dedupe usa `invoiceId:outcome`.
 */

export type HublaOutcome =
  | 'won' // venda paga
  | 'lost' // pagamento falhou / fatura expirada / cancelada
  | 'refunded' // reembolso efetivado
  | 'refund_requested' // reembolso solicitado (ainda não efetivado)
  | 'refund_rejected'; // solicitação de reembolso rejeitada/cancelada

const TYPE_TO_OUTCOME: Record<string, HublaOutcome> = {
  'invoice.payment_succeeded': 'won',
  'invoice.payment_failed': 'lost',
  'invoice.expired': 'lost',
  'invoice.refunded': 'refunded',
  'refund_request.created': 'refund_requested',
  'refund_request.accepted': 'refunded',
  'refund_request.rejected': 'refund_rejected',
  'refund_request.canceled': 'refund_rejected',
};

const STATUS_TO_OUTCOME: Record<string, HublaOutcome> = {
  paid: 'won',
  failed: 'lost',
  expired: 'lost',
  canceled: 'lost',
  cancelled: 'lost',
  refunded: 'refunded',
};

export type HublaParsed = {
  outcome: HublaOutcome;
  eventType: string;
  /** Chave de idempotência: uma por fatura + resultado. */
  dedupeKey: string;
  invoiceId: string;
  /** Nomes de todos os itens da fatura (produto principal + orderbumps), separados por " + ". */
  productName: string | null;
  productId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  /** Valor total em reais. */
  amount: number;
  paymentMethod: string | null;
};

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function obj(v: unknown): Record<string, any> {
  return v && typeof v === 'object' ? (v as Record<string, any>) : {};
}

export function parseHublaEvent(body: unknown): HublaParsed | null {
  const root = obj(body);
  const type = str(root.type);
  if (!type) return null;

  const event = obj(root.event);
  const invoice = obj(event.invoice);

  let outcome: HublaOutcome | undefined = TYPE_TO_OUTCOME[type];
  if (!outcome && type === 'invoice.status_updated') {
    const status = str(invoice.status)?.toLowerCase();
    if (status) outcome = STATUS_TO_OUTCOME[status];
  }
  if (!outcome) return null;

  // Reembolso: o id da fatura pode vir em event.invoiceId / event.refundRequest.invoiceId
  const invoiceId =
    str(invoice.id) ||
    str(event.invoiceId) ||
    str(obj(event.refundRequest).invoiceId) ||
    str(obj(event.refundRequest).id);
  if (!invoiceId) return null;

  const user = obj(event.user);
  const payer = obj(invoice.payer);
  const email = (str(user.email) || str(payer.email))?.toLowerCase() ?? null;
  const first = str(user.firstName) || str(payer.firstName);
  const last = str(user.lastName) || str(payer.lastName);
  const name = [first, last].filter(Boolean).join(' ') || null;

  const amountObj = obj(invoice.amount);
  const cents = Number(amountObj.totalCents);
  const amount = Number.isFinite(cents) ? cents / 100 : Number(amountObj.total) || 0;

  const product = obj(event.product);
  const names = Array.isArray(event.products)
    ? (event.products as unknown[]).map((p) => str(obj(p).name)).filter((n): n is string => !!n)
    : [];
  const allNames = Array.from(new Set([...names, ...(str(product.name) ? [str(product.name)!] : [])]));

  return {
    outcome,
    eventType: type,
    dedupeKey: `hubla:${invoiceId}:${outcome}`,
    invoiceId,
    productName: allNames.length ? allNames.join(' + ') : null,
    productId: str(product.id),
    buyerName: name,
    buyerEmail: email,
    buyerPhone: str(user.phone) || str(payer.phone),
    amount,
    paymentMethod: str(invoice.paymentMethod),
  };
}
