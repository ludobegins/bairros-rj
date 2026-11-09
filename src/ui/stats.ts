import type { Screen } from './context.ts';
import { h } from './dom.ts';

const MAX_ROWS = 30;

export const statsScreen: Screen = (ctx, nav) => {
  const { view } = ctx;
  view.clearStatuses();
  const byId = new Map(ctx.places.map((p) => [p.id, p]));

  const rows = Object.entries(ctx.storage.getPlaceStats())
    .map(([id, s]) => {
      const firstTry = s.correctByAttempt[0];
      const errors = s.asked - firstTry; // anything but a first-try hit
      const tone = s.missed / s.asked >= 0.5 ? ('bad' as const) : ('late' as const);
      return { place: byId.get(id), s, firstTry, errorRate: errors / s.asked, tone };
    })
    .filter((r) => r.place && r.errorRate > 0)
    .sort((a, b) => b.errorRate - a.errorRate || b.s.asked - a.s.asked)
    .slice(0, MAX_ROWS);

  // Paint the map: red = missed at least half the time, yellow = often not on 1st try.
  for (const r of rows) view.setStatus(r.place!.id, r.tone === 'bad' ? 'missed' : 'correctLate');

  const body =
    rows.length === 0
      ? h('p', {}, 'Ainda não há erros registrados. Jogue algumas rodadas!')
      : h(
          'ol',
          { class: 'result-list' },
          ...rows.map((r) =>
            h(
              'li',
              {},
              h(
                'button',
                {
                  class: `result-row ${r.tone}`,
                  onclick: () => {
                    view.highlight(r.place!.id);
                    view.ensureVisible(r.place!.id);
                  },
                },
                h('span', { class: 'result-name' }, r.place!.name),
                h(
                  'span',
                  { class: 'result-detail' },
                  [
                    `${r.firstTry}/${r.s.asked} de primeira`,
                    r.s.missed > 0 && `errou ${r.s.missed}×`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ),
            ),
          ),
        );

  const panel = h(
    'section',
    { class: 'panel stats', 'aria-labelledby': 'stats-title' },
    h('h2', { id: 'stats-title', tabindex: '-1' }, 'Onde você mais erra'),
    body,
    h(
      'div',
      { class: 'actions' },
      h('button', { onclick: () => nav.menu() }, 'Voltar'),
      rows.length > 0 &&
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (confirm('Apagar todas as estatísticas? Os recordes são mantidos.')) {
                ctx.storage.resetStats();
                nav.stats();
              }
            },
          },
          'Apagar estatísticas',
        ),
    ),
  );
  ctx.root.append(panel);

  return () => {
    view.highlight(null);
    view.clearStatuses();
    panel.remove();
  };
};
