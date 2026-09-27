import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';

/**
 * Horários livres de verdade, para a IA oferecer na hora.
 *
 * Cruza o horário de funcionamento com os bloqueios e os agendamentos já
 * marcados. A clínica que ainda não cadastrou horário de funcionamento (não há
 * tela para isso) usa o padrão de clínica estética: seg–sex 9h–19h, sáb 9h–13h.
 */

type Cliente = SupabaseClient<Database>;

const PADRAO: Record<number, [string, string] | null> = {
  0: null,
  1: ['09:00', '19:00'],
  2: ['09:00', '19:00'],
  3: ['09:00', '19:00'],
  4: ['09:00', '19:00'],
  5: ['09:00', '19:00'],
  6: ['09:00', '13:00'],
};

/** Partes da data/hora de um instante vistas no fuso da clínica. */
function noFuso(instante: Date, fuso: string) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instante);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    ano: Number(v('year')),
    mes: Number(v('month')),
    dia: Number(v('day')),
    hora: Number(v('hour')),
    minuto: Number(v('minute')),
    semana: dias.indexOf(v('weekday')),
  };
}

/** Data/hora local da clínica → instante UTC. */
export function localParaUtc(ano: number, mes: number, dia: number, hora: number, minuto: number, fuso: string): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const visto = noFuso(new Date(comoUtc), fuso);
  const vistoUtc = Date.UTC(visto.ano, visto.mes - 1, visto.dia, visto.hora, visto.minuto);
  return new Date(comoUtc - (vistoUtc - comoUtc));
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export type HorarioLivre = { inicio: Date; rotulo: string; local: string };

export async function horariosLivres(
  cliente: Cliente,
  entrada: { clinicaId: string; fuso: string; dias?: number; duracao?: number; limite?: number },
): Promise<HorarioLivre[]> {
  const dias = entrada.dias ?? 7;
  const duracao = entrada.duracao ?? 60;
  const agora = new Date();
  const ate = new Date(agora.getTime() + (dias + 1) * 86_400_000);

  const [{ data: funcionamento }, { data: bloqueios }, { data: marcados }] = await Promise.all([
    cliente
      .from('horarios_funcionamento')
      .select('dia_semana, abre, fecha')
      .eq('clinica_id', entrada.clinicaId),
    cliente
      .from('bloqueios_agenda')
      .select('inicio, fim, profissional_id')
      .eq('clinica_id', entrada.clinicaId)
      .is('profissional_id', null)
      .lt('inicio', ate.toISOString())
      .gt('fim', agora.toISOString()),
    cliente
      .from('agendamentos')
      .select('inicio, fim')
      .eq('clinica_id', entrada.clinicaId)
      .is('cancelado_em', null)
      .not('status', 'in', '(cancelado,faltou)')
      .lt('inicio', ate.toISOString())
      .gt('fim', agora.toISOString()),
  ]);

  const janelas = new Map<number, Array<[string, string]>>();
  for (const f of funcionamento ?? []) {
    const lista = janelas.get(f.dia_semana) ?? [];
    lista.push([f.abre.slice(0, 5), f.fecha.slice(0, 5)]);
    janelas.set(f.dia_semana, lista);
  }
  const usarPadrao = janelas.size === 0;

  const ocupados = [...(bloqueios ?? []), ...(marcados ?? [])].map((o) => [
    new Date(o.inicio).getTime(),
    new Date(o.fim).getTime(),
  ]);

  // Pelo menos 2 h de antecedência: ninguém marca para daqui a 10 minutos.
  const cedoDemais = agora.getTime() + 2 * 3_600_000;
  const livres: HorarioLivre[] = [];
  const hoje = noFuso(agora, entrada.fuso);

  for (let d = 0; d <= dias; d += 1) {
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d, 12));
    const semana = base.getUTCDay();
    const faixas = usarPadrao
      ? PADRAO[semana]
        ? [PADRAO[semana]!]
        : []
      : (janelas.get(semana) ?? []);

    for (const [abre, fecha] of faixas) {
      for (let m = minutos(abre); m + duracao <= minutos(fecha); m += 60) {
        const inicio = localParaUtc(
          base.getUTCFullYear(),
          base.getUTCMonth() + 1,
          base.getUTCDate(),
          Math.floor(m / 60),
          m % 60,
          entrada.fuso,
        );
        const fim = inicio.getTime() + duracao * 60_000;
        if (inicio.getTime() < cedoDemais) continue;
        if (ocupados.some(([oi, of]) => inicio.getTime() < of && fim > oi)) continue;
        const l = noFuso(inicio, entrada.fuso);
        const pad = (n: number) => String(n).padStart(2, '0');
        // "quarta-feira, 30/09 às 14h" — como uma pessoa escreveria.
        const dia = new Intl.DateTimeFormat('pt-BR', {
          timeZone: entrada.fuso,
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
        }).format(inicio);
        const rotulo = `${dia} às ${l.hora}h${l.minuto ? pad(l.minuto) : ''}`;
        livres.push({
          inicio,
          rotulo,
          local: `${l.ano}-${pad(l.mes)}-${pad(l.dia)}T${pad(l.hora)}:${pad(l.minuto)}`,
        });
      }
    }
  }

  return livres.slice(0, entrada.limite ?? 40);
}
