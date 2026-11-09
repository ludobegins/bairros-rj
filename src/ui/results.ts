import type { GameResult, QuestionResult } from '../core/session.ts';
import type { AppContext, Nav } from './context.ts';
import { h } from './dom.ts';
import { AREA_LABELS, MODE_LABELS, ZONE_LABELS, formatTime } from './format.ts';

function outcome(r: QuestionResult): { icon: string; label: string; cls: string } {
  if (r.correctOnAttempt === 1) return { icon: '✓', label: 'de primeira', cls: 'good' };
  if (r.correctOnAttempt)
    return { icon: '≈', label: `na ${r.correctOnAttempt}ª tentativa`, cls: 'late' };
  return { icon: '✗', label: r.skipped ? 'pulou' : 'errou', cls: 'bad' };
}

export function resultsScreen(
  ctx: AppContext,
  nav: Nav,
  result: GameResult,
  isNewRecord: boolean,
): () => void {
  const { view } = ctx;
  let highlightTimer = 0;

  const list = h(
    'ol',
    { class: 'result-list' },
    ...result.results.map((r) => {
      const o = outcome(r);
      return h(
        'li',
        {},
        h(
          'button',
          {
            class: `result-row ${o.cls}`,
            onclick: () => {
              view.highlight(r.place.id);
              view.ensureVisible(r.place.id);
              window.clearTimeout(highlightTimer);
              highlightTimer = window.setTimeout(() => view.highlight(null), 2500);
            },
          },
          h('span', { class: 'result-icon', 'aria-hidden': 'true' }, o.icon),
          h('span', { class: 'result-name' }, r.place.name),
          h('span', { class: 'result-detail' }, `${o.label} · ${r.points} pts`),
        ),
      );
    }),
  );

  const { config } = result;
  const panel = h(
    'section',
    { class: 'panel results', 'aria-labelledby': 'results-title' },
    h(
      'h2',
      { id: 'results-title', tabindex: '-1' },
      isNewRecord ? 'Novo recorde! 🎉' : 'Fim da rodada',
    ),
    h(
      'p',
      { class: 'big-score' },
      h('strong', {}, `${result.score}`),
      ` / ${result.maxScore} pts · ${formatTime(result.durationMs)}`,
    ),
    h(
      'p',
      { class: 'subtitle' },
      `${MODE_LABELS[config.mode]} · ${AREA_LABELS[config.area]} · ${ZONE_LABELS[config.zone]}`,
    ),
    list,
    h(
      'div',
      { class: 'actions' },
      h('button', { onclick: () => nav.menu() }, 'Menu'),
      h('button', { class: 'primary', onclick: () => nav.play(config) }, 'Jogar de novo'),
    ),
  );
  ctx.root.append(panel);
  ctx.updateInsets();
  view.fitTo(result.results.map((r) => r.place.id));

  view.onPlaceClick((id) => {
    const p = view.getPlace(id);
    if (p) ctx.toast(p.name);
  });

  return () => {
    window.clearTimeout(highlightTimer);
    view.onPlaceClick(null);
    view.highlight(null);
    panel.remove();
  };
}
