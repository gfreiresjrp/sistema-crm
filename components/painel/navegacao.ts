import {
  Activity,
  Bot,
  CalendarDays,
  LayoutDashboard,
  Contact,
  Megaphone,
  MessageCircle,
  Settings2,
  Users,
  WandSparkles,
} from 'lucide-react';

export type Vista =
  | 'Dashboard'
  | 'Conversas'
  | 'Agenda'
  | 'Contatos'
  | 'Lista de Leads'
  | 'Reativação'
  | 'Campanhas'
  | 'Relatórios'
  | 'Minha clínica'
  | 'Configurar IA';

/** [grupo, vista, ícone] — o grupo vazio herda o título da linha anterior. */
export const NAVEGACAO: Array<[string, Vista, React.ElementType]> = [
  ['VISÃO GERAL', 'Dashboard', LayoutDashboard],
  ['', 'Conversas', MessageCircle],
  ['', 'Agenda', CalendarDays],
  ['RELACIONAMENTO', 'Contatos', Contact],
  ['', 'Lista de Leads', Users],
  ['', 'Reativação', WandSparkles],
  ['', 'Campanhas', Megaphone],
  ['GESTÃO', 'Relatórios', Activity],
  ['', 'Minha clínica', Settings2],
  ['', 'Configurar IA', Bot],
];
