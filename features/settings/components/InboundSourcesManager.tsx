import React, { useMemo, useState } from 'react';
import { Copy, Check, KeyRound, Pencil, Power, Trash2, Plus, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

type SourceRow = {
  id: string;
  name: string;
  entry_board_id: string;
  entry_stage_id: string;
  secret: string;
  active: boolean;
  move_existing: boolean;
  add_tag: string | null;
};

type FormState = {
  id: string | null;
  name: string;
  boardId: string;
  stageId: string;
  moveExisting: boolean;
  tag: string;
};

function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function buildUrl(id: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/functions/v1/webhook-in/${id}`;
}

const BODY_TEMPLATE = `{
  "name": "{{nome}}",
  "email": "{{email}}",
  "phone": "{{telefone}}",
  "source": "hotwebinar"
}`;

const btn =
  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-60';

/**
 * Lista e gerencia TODAS as entradas de leads (webhooks de entrada).
 * Cada entrada tem URL + secret próprios e define funil/etapa de destino.
 */
export const InboundSourcesManager: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const { data: boards = [] } = useBoards();

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<SourceRow | null>(null);

  const orgId = profile?.organization_id;

  async function load() {
    if (!supabase || !orgId) return;
    const { data } = await supabase
      .from('integration_inbound_sources')
      .select('id,name,entry_board_id,entry_stage_id,secret,active,move_existing,add_tag')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setSources((data as any) || []);
  }

  React.useEffect(() => {
    load();
  }, [orgId]);

  const boardById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const formStages = form ? boardById.get(form.boardId)?.stages || [] : [];

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  function openNew() {
    const b = boards.find((x) => x.isDefault) || boards[0];
    setForm({ id: null, name: '', boardId: b?.id || '', stageId: b?.stages?.[0]?.id || '', moveExisting: false, tag: '' });
  }

  function openEdit(s: SourceRow) {
    setForm({
      id: s.id,
      name: s.name,
      boardId: s.entry_board_id,
      stageId: s.entry_stage_id,
      moveExisting: !!s.move_existing,
      tag: s.add_tag || '',
    });
  }

  async function save() {
    if (!form || !orgId || !supabase) return;
    if (!form.name.trim() || !form.boardId || !form.stageId) {
      addToast('Preencha nome, funil e etapa.', 'error');
      return;
    }
    setLoading(true);
    try {
      const fields = {
        name: form.name.trim(),
        entry_board_id: form.boardId,
        entry_stage_id: form.stageId,
        move_existing: form.moveExisting,
        add_tag: form.tag.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase.from('integration_inbound_sources').update(fields).eq('id', form.id).eq('organization_id', orgId);
        if (error) throw error;
        addToast('Entrada atualizada.', 'success');
      } else {
        const { error } = await supabase
          .from('integration_inbound_sources')
          .insert({ ...fields, organization_id: orgId, secret: generateSecret(), active: true });
        if (error) throw error;
        addToast('Entrada criada. Copie a URL e o secret.', 'success');
      }
      setForm(null);
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar entrada', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(s: SourceRow) {
    if (!supabase || !orgId) return;
    const { error } = await supabase.from('integration_inbound_sources').update({ active: !s.active }).eq('id', s.id).eq('organization_id', orgId);
    if (error) addToast(error.message, 'error');
    await load();
  }

  async function remove() {
    if (!deleting || !supabase || !orgId) return;
    const { error } = await supabase.from('integration_inbound_sources').delete().eq('id', deleting.id).eq('organization_id', orgId);
    if (error) addToast(error.message, 'error');
    else addToast('Entrada removida.', 'success');
    setDeleting(null);
    await load();
  }

  return (
    <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Entradas de leads (webhooks)</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Cada plataforma (HotWebinar, ManyChat, formulários...) usa a sua própria entrada, com URL e secret próprios.
            Escolha o funil e a etapa para onde o lead vai.
          </p>
        </div>
        <button onClick={openNew} disabled={boards.length === 0} className="inline-flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
          <Plus className="h-4 w-4" />
          Nova entrada
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {sources.length === 0 && <div className="text-sm text-slate-500">Nenhuma entrada criada ainda.</div>}
        {sources.map((s) => {
          const b = boardById.get(s.entry_board_id);
          const st = b?.stages?.find((x) => x.id === s.entry_stage_id);
          return (
            <div key={s.id} className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1">
                    <span>{b?.name || 'Funil removido'}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{st?.label || 'Etapa removida'}</span>
                    {s.move_existing && (
                      <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
                        <ArrowUpRight className="h-3 w-3" />
                        move quem já está no funil
                      </span>
                    )}
                    {s.add_tag && <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 font-semibold">tag: {s.add_tag}</span>}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase ${s.active ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
                  {s.active ? 'Ativo' : 'Desativado'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className={btn} onClick={() => copy(buildUrl(s.id), `url-${s.id}`)}>
                  <Copy className="h-4 w-4" />
                  Copiar URL
                  {copied === `url-${s.id}` && <Check className="h-4 w-4 text-green-600" />}
                </button>
                <button className={btn} onClick={() => copy(s.secret, `sec-${s.id}`)}>
                  <KeyRound className="h-4 w-4" />
                  Copiar secret
                  {copied === `sec-${s.id}` && <Check className="h-4 w-4 text-green-600" />}
                </button>
                <button className={btn} onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button className={btn} onClick={() => toggle(s)}>
                  <Power className="h-4 w-4" />
                  {s.active ? 'Desativar' : 'Ativar'}
                </button>
                <button className={`${btn} text-red-700 dark:text-red-300`} onClick={() => setDeleting(s)}>
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 space-y-2">
        <div className="font-bold text-slate-800 dark:text-slate-100">Como configurar na plataforma (ex.: HotWebinar)</div>
        <div>1. Método <b>POST</b> e URL = a URL da entrada. 2. Header: chave <code>X-Webhook-Secret</code>, valor = o secret. 3. Corpo (script) com e-mail e/ou telefone do lead:</div>
        <pre className="p-2 rounded bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 overflow-x-auto">{BODY_TEMPLATE}</pre>
        <button className={btn} onClick={() => copy(BODY_TEMPLATE, 'body')}>
          <Copy className="h-4 w-4" />
          Copiar corpo de exemplo
          {copied === 'body' && <Check className="h-4 w-4 text-green-600" />}
        </button>
        <div>Troque os <code>{'{{...}}'}</code> pelas variáveis que a plataforma oferece (botão “Adicionar variável”).</div>
      </div>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar entrada' : 'Nova entrada de leads'} size="lg">
        {form && (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="font-semibold">Nome (ex.: HotWebinar - Entrou na aula)</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20" />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Funil</span>
              <select
                value={form.boardId}
                onChange={(e) => setForm({ ...form, boardId: e.target.value, stageId: boardById.get(e.target.value)?.stages?.[0]?.id || '' })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Etapa de destino</span>
              <select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20">
                {formStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.moveExisting} onChange={(e) => setForm({ ...form, moveExisting: e.target.checked })} className="mt-1" />
              <span>
                <b>Mover o lead se ele já estiver neste funil</b>
                <span className="block text-xs text-slate-500">Avança para esta etapa (nunca volta para uma etapa anterior). Se não existir, cria o lead nesta etapa.</span>
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Tag para marcar o lead (opcional)</span>
              <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="ex.: entrou-na-aula" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className={btn} onClick={() => setForm(null)}>Cancelar</button>
              <button onClick={save} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
                Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Excluir entrada?"
        message={`A URL de "${deleting?.name}" deixará de funcionar.`}
        confirmText="Excluir"
        variant="danger"
      />
    </div>
  );
};
