import type { Area, Mode, ZoneFilter } from '../types.ts';
import { ZONES } from '../types.ts';
import type { Screen } from './context.ts';
import { h, segmented } from './dom.ts';
import { AREA_LABELS, MODE_LABELS, ZONE_LABELS, formatTime } from './format.ts';

export const menuScreen: Screen = (ctx, nav) => {
  ctx.view.clearStatuses();
  ctx.view.highlight(null);

  const record = h('p', { class: 'record' });
  const updateRecord = () => {
    const hs = ctx.storage.getHighScore(ctx.config);
    record.textContent = hs
      ? `Recorde: ${hs.score} pts em ${formatTime(hs.durationMs)}`
      : 'Sem recorde nesta combinação ainda.';
  };

  const update = (patch: Partial<typeof ctx.config>) => {
    ctx.setConfig({ ...ctx.config, ...patch });
    ctx.prepareMap(ctx.config);
    updateRecord();
  };

  const zoneSelect = h(
    'select',
    {
      id: 'zone',
      onchange: (e: Event) => update({ zone: (e.target as HTMLSelectElement).value as ZoneFilter }),
    },
    ...(['all', ...ZONES] as ZoneFilter[]).map((z) =>
      h('option', { value: z, selected: z === ctx.config.zone }, ZONE_LABELS[z]),
    ),
  );

  const panel = h(
    'section',
    { class: 'panel menu', 'aria-labelledby': 'menu-title' },
    h('h1', { id: 'menu-title', tabindex: '-1' }, 'Bairros RJ'),
    h('p', { class: 'subtitle' }, 'Quanto você conhece o mapa do Rio?'),
    segmented<Mode>(
      'mode',
      'Modo',
      (['type', 'click'] as const).map((m) => ({ value: m, label: MODE_LABELS[m] })),
      ctx.config.mode,
      (mode) => update({ mode }),
    ),
    segmented<Area>(
      'area',
      'Área',
      (['rio', 'grande-rio'] as const).map((a) => ({ value: a, label: AREA_LABELS[a] })),
      ctx.config.area,
      (area) => update({ area }),
    ),
    h('label', { class: 'field' }, h('span', {}, 'Zona do Rio'), zoneSelect),
    record,
    h('button', { class: 'primary', onclick: () => nav.play(ctx.config) }, 'Jogar'),
    h('button', { class: 'link', onclick: () => nav.stats() }, 'Estatísticas'),
    h('p', { class: 'hint' }, 'Dica: toque no mapa para ver o nome de um lugar.'),
  );
  updateRecord();
  ctx.root.append(panel);
  ctx.updateInsets();
  ctx.prepareMap(ctx.config);

  ctx.view.onPlaceClick((id) => {
    const p = ctx.view.getPlace(id);
    if (p) ctx.toast(p.zone ? `${p.name} · ${ZONE_LABELS[p.zone]}` : `${p.name} (município)`);
  });

  return () => {
    ctx.view.onPlaceClick(null);
    panel.remove();
  };
};
