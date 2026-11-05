import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { isValidUUID } from '@/lib/supabase/utils';
import { parseHublaEvent, type HublaParsed } from '@/lib/integrations/hubla';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Webhook da Hubla → NossoCRM.
 *
 * URL (cadastrar na Hubla): POST /api/webhooks/hubla/<source_id>
 *   - <source_id>: id de uma "Entrada de Leads" (Configurações → Integrações → Webhooks),
 *     que define organização, board e etapa de entrada.
 * Auth: header `x-hubla-token` = env HUBLA_WEBHOOK_TOKEN (token mostrado pela Hubla).
 * Sandbox (`x-hubla-sandbox: true`) é ignorado, salvo HUBLA_ACCEPT_SANDBOX=true.
 *
 * Eventos tratados: venda paga, pagamento falho/fatura expirada (perdido),
 * reembolso efetivado (perdido, motivo "Reembolsado"), solicitação de reembolso.
 */

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const LOSS_REASON: Record<string, string> = {
  lost: 'Pagamento não concluído (Hubla)',
  refunded: 'Reembolsado (Hubla)',
};

export async function POST(request: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  const expectedToken = process.env.HUBLA_WEBHOOK_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'HUBLA_WEBHOOK_TOKEN não configurado' }, { status: 500 });
  }
  const provided = request.headers.get('x-hubla-token')?.trim() ?? '';
  if (!provided || !tokenMatches(provided, expectedToken)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const { sourceId } = await ctx.params;
  if (!isValidUUID(sourceId)) {
    return NextResponse.json({ error: 'source_id inválido' }, { status: 404 });
  }

  const isSandbox = request.headers.get('x-hubla-sandbox')?.toLowerCase() === 'true';
  if (isSandbox && process.env.HUBLA_ACCEPT_SANDBOX !== 'true') {
    return NextResponse.json({ ok: true, ignored: 'sandbox' });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseHublaEvent(body);
  if (!parsed) {
    // Evento que não nos interessa (assinatura, lead, etc.): 200 para a Hubla não reenviar.
    return NextResponse.json({ ok: true, ignored: 'evento não tratado' });
  }

  const sb = createStaticAdminClient();

  const { data: source, error: sourceErr } = await sb
    .from('integration_inbound_sources')
    .select('id, organization_id, entry_board_id, entry_stage_id, active')
    .eq('id', sourceId)
    .maybeSingle();
  if (sourceErr) return NextResponse.json({ error: 'Erro ao buscar fonte' }, { status: 500 });
  if (!source || !source.active) {
    return NextResponse.json({ error: 'Fonte não encontrada/inativa' }, { status: 404 });
  }

  // Idempotência: uma linha por fatura + resultado.
  const { error: dedupeErr } = await sb.from('webhook_events_in').insert({
    organization_id: source.organization_id,
    source_id: source.id,
    provider: 'hubla',
    external_event_id: parsed.dedupeKey,
    payload: body as Record<string, unknown>,
    status: 'received',
  });
  if (dedupeErr) {
    if (String(dedupeErr.message).toLowerCase().includes('duplicate')) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[hubla] falha ao registrar evento', dedupeErr);
    return NextResponse.json({ error: 'Falha ao registrar evento' }, { status: 500 });
  }

  try {
    const result = await applyEvent(sb, source, parsed);
    await sb
      .from('webhook_events_in')
      .update({
        status: 'processed',
        created_contact_id: result.contactId,
        created_deal_id: result.dealId,
      })
      .eq('source_id', source.id)
      .eq('external_event_id', parsed.dedupeKey);
    return NextResponse.json({ ok: true, outcome: parsed.outcome, deal_id: result.dealId });
  } catch (err) {
    console.error('[hubla] erro ao processar', err);
    // Libera a chave para a Hubla poder reenviar e reprocessar.
    await sb
      .from('webhook_events_in')
      .delete()
      .eq('source_id', source.id)
      .eq('external_event_id', parsed.dedupeKey);
    return NextResponse.json({ error: 'Falha ao processar evento' }, { status: 500 });
  }
}

type Sb = ReturnType<typeof createStaticAdminClient>;
type Source = { id: string; organization_id: string; entry_board_id: string; entry_stage_id: string };

async function findOrCreateContact(sb: Sb, orgId: string, p: HublaParsed): Promise<string | null> {
  if (!p.buyerEmail && !p.buyerPhone) return null;

  let existing: { id: string } | null = null;
  if (p.buyerEmail) {
    const { data } = await sb
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', p.buyerEmail)
      .limit(1)
      .maybeSingle();
    existing = data;
  }
  if (!existing && p.buyerPhone) {
    const { data } = await sb
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone', p.buyerPhone)
      .limit(1)
      .maybeSingle();
    existing = data;
  }
  if (existing) return existing.id;

  const { data: created, error } = await sb
    .from('contacts')
    .insert({
      organization_id: orgId,
      name: p.buyerName || p.buyerEmail || p.buyerPhone || 'Cliente Hubla',
      email: p.buyerEmail,
      phone: p.buyerPhone,
      source: 'hubla',
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

async function applyEvent(sb: Sb, source: Source, p: HublaParsed) {
  const orgId = source.organization_id;
  const now = new Date().toISOString();
  const contactId = await findOrCreateContact(sb, orgId, p);

  // Negócio já ligado a esta fatura?
  const { data: byInvoice } = await sb
    .from('deals')
    .select('id, custom_fields')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .contains('custom_fields', { hubla_invoice_id: p.invoiceId })
    .limit(1)
    .maybeSingle();
  let dealId: string | null = (byInvoice?.id as string) ?? null;
  const prevFields = (byInvoice?.custom_fields as Record<string, unknown>) ?? {};

  // Sem deal da fatura: reaproveita um negócio aberto do mesmo contato no board de entrada.
  if (!dealId && contactId) {
    const { data: open } = await sb
      .from('deals')
      .select('id, custom_fields')
      .eq('organization_id', orgId)
      .eq('board_id', source.entry_board_id)
      .eq('contact_id', contactId)
      .eq('is_won', false)
      .eq('is_lost', false)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open && (p.outcome === 'won' || p.outcome === 'lost')) dealId = open.id as string;
  }

  const hublaFields = {
    hubla_invoice_id: p.invoiceId,
    hubla_product: p.productName,
    hubla_payment_method: p.paymentMethod,
  };

  // Solicitações de reembolso só marcam um negócio existente.
  if (p.outcome === 'refund_requested' || p.outcome === 'refund_rejected') {
    if (!dealId) return { contactId, dealId: null };
    await sb
      .from('deals')
      .update({
        custom_fields: { ...prevFields, hubla_refund_requested: p.outcome === 'refund_requested' },
        updated_at: now,
      })
      .eq('id', dealId);
    return { contactId, dealId };
  }

  const closing: Record<string, unknown> =
    p.outcome === 'won'
      ? { is_won: true, is_lost: false, probability: 100, loss_reason: null }
      : { is_won: false, is_lost: true, probability: 0, loss_reason: LOSS_REASON[p.outcome] };

  if (dealId) {
    const { error } = await sb
      .from('deals')
      .update({
        ...closing,
        ...(p.amount > 0 ? { value: p.amount } : {}),
        closed_at: now,
        updated_at: now,
        custom_fields: { ...prevFields, ...hublaFields, hubla_refund_requested: false },
      })
      .eq('id', dealId);
    if (error) throw error;
    return { contactId, dealId };
  }

  const { data: created, error } = await sb
    .from('deals')
    .insert({
      organization_id: orgId,
      title: p.productName ? `${p.productName} — ${p.buyerName ?? p.buyerEmail ?? 'Cliente'}` : p.buyerName ?? 'Venda Hubla',
      value: p.amount,
      priority: 'medium',
      board_id: source.entry_board_id,
      stage_id: source.entry_stage_id,
      contact_id: contactId,
      last_stage_change_date: now,
      closed_at: now,
      tags: ['Hubla'],
      custom_fields: hublaFields,
      ...closing,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { contactId, dealId: created.id as string };
}
