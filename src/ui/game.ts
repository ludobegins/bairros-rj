import { createMatcher } from '../core/matcher.ts';
import { drawRound, placesInArea } from '../core/round.ts';
import { GameSession, MAX_ATTEMPTS, type Feedback, type Phase } from '../core/session.ts';
import type { GameConfig } from '../types.ts';
import type { AppContext, Nav } from './context.ts';
import { h } from './dom.ts';
import { formatTime } from './format.ts';

/** Delay before moving on automatically after a correct answer / a reveal. */
const AUTO_NEXT_CORRECT_MS = 1200;
const AUTO_NEXT_REVEAL_MS = 3000;

export function gameScreen(ctx: AppContext, nav: Nav, config: GameConfig): () => void {
  const { view } = ctx;
  const session = new GameSession({
    config,
    questions: drawRound(ctx.places, config),
    placeById: (id) => view.getPlace(id),
    matcher: config.mode === 'type' ? createMatcher(placesInArea(ctx.places, config)) : undefined,
  });

  view.clearStatuses();

  // --- DOM -----------------------------------------------------------------
  const progress = h('span', { class: 'hud-progress' });
  const score = h('span', { class: 'hud-score' });
  const clock = h('span', { class: 'hud-time', 'aria-label': 'Tempo' });
  const quitButton = h(
    'button',
    {
      class: 'icon',
      'aria-label': 'Sair da partida',
      onclick: () => {
        if (session.phase === 'finished' || confirm('Sair da partida? O progresso será perdido.')) {
          nav.menu();
        }
      },
    },
    '✕',
  );
  const hud = h('header', { class: 'hud' }, progress, score, clock, quitButton);

  const prompt = h('h2', { class: 'prompt' });
  const attempts = h('div', { class: 'attempts', 'aria-label': 'Tentativas restantes' });
  const feedback = h('p', { class: 'feedback', 'aria-live': 'polite' });
  const input = h('input', {
    type: 'text',
    placeholder: 'Nome do lugar',
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'send',
    'aria-label': 'Nome do lugar',
  });
  const submit = h('button', { type: 'submit', class: 'primary' }, 'OK');
  const form = h('form', { class: 'answer', onsubmit: onSubmit }, input, submit);
  const skipButton = h('button', { type: 'button', onclick: () => session.skip() }, 'Pular');
  const nextButton = h('button', { type: 'button', class: 'primary', onclick: next }, 'Próximo');
  const actions = h('div', { class: 'actions' }, skipButton, nextButton);
  const panel = h(
    'section',
    { class: `panel game mode-${config.mode}` },
    prompt,
    attempts,
    config.mode === 'type' ? form : null,
    feedback,
    actions,
  );
  ctx.root.append(hud, panel);
  ctx.updateInsets();
  ctx.prepareMap(config);

  // --- Behaviour -----------------------------------------------------------
  let autoNext = 0;
  const tick = window.setInterval(renderClock, 500);

  function renderClock() {
    clock.textContent = formatTime(session.elapsedMs());
  }

  function renderStatus() {
    progress.textContent = `${Math.min(session.index + 1, session.questions.length)}/${session.questions.length}`;
    score.textContent = `${session.score} pts`;
    attempts.replaceChildren(
      ...Array.from({ length: MAX_ATTEMPTS }, (_, i) =>
        h('span', { class: i < session.attemptsLeft ? 'dot' : 'dot used' }),
      ),
    );
    attempts.setAttribute('aria-label', `${session.attemptsLeft} tentativas restantes`);
    const revealed = session.phase !== 'asking';
    skipButton.hidden = revealed;
    nextButton.hidden = !revealed;
    nextButton.textContent = session.isLastQuestion ? 'Ver resultado' : 'Próximo';
    input.disabled = revealed;
    renderClock();
  }

  function startQuestion() {
    const q = session.current;
    feedback.textContent = '';
    feedback.className = 'feedback';
    if (config.mode === 'type') {
      prompt.textContent =
        q.kind === 'municipality' ? 'Qual é este município?' : 'Qual é este bairro?';
      view.highlight(q.id);
      view.ensureVisible(q.id);
      input.value = '';
      input.focus();
    } else {
      prompt.replaceChildren(
        'Onde fica ',
        h('strong', {}, q.name),
        q.kind === 'municipality' ? ' (município)' : '',
        '?',
      );
      view.highlight(null);
    }
    renderStatus();
  }

  function say(text: string, tone: 'good' | 'bad' | 'neutral') {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  }

  function reveal() {
    const q = session.current;
    view.setStatus(q.id, 'missed');
    view.highlight(q.id);
    view.ensureVisible(q.id);
    scheduleNext(AUTO_NEXT_REVEAL_MS);
  }

  function scheduleNext(ms: number) {
    window.clearTimeout(autoNext);
    autoNext = window.setTimeout(next, ms);
  }

  function onFeedback(fb: Feedback) {
    const q = session.current;
    switch (fb.type) {
      case 'correct':
        view.highlight(null);
        view.setStatus(q.id, fb.attempt === 1 ? 'correct1' : 'correctLate');
        say(`Acertou! +${fb.points} ${fb.points === 1 ? 'ponto' : 'pontos'}`, 'good');
        scheduleNext(AUTO_NEXT_CORRECT_MS);
        break;
      case 'wrong':
        if (config.mode === 'click') view.flash(fb.guessed.id);
        if (fb.revealed) {
          say(`Não, esse é ${fb.guessed.name}. Era ${q.name}.`, 'bad');
          reveal();
        } else {
          say(
            `Não, esse é ${fb.guessed.name}. ${fb.attemptsLeft === 1 ? 'Última tentativa.' : `Restam ${fb.attemptsLeft} tentativas.`}`,
            'bad',
          );
          if (config.mode === 'type') input.select();
        }
        break;
      case 'unknown':
        say('Não conheço esse lugar. Tente de novo.', 'neutral');
        input.select();
        break;
      case 'skipped':
        say(`Era ${q.name}.`, 'bad');
        reveal();
        break;
      case 'ignored':
        return;
    }
    renderStatus();
    // Keep keyboard flow: Enter on the now-visible button moves on.
    if (session.phase === 'revealed') nextButton.focus();
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    if (session.phase === 'revealed') return next();
    if (input.value.trim()) session.answerByName(input.value);
  }

  function next() {
    window.clearTimeout(autoNext);
    if (session.phase !== 'revealed') return;
    session.next();
    // Re-read the phase: TypeScript keeps the narrowing from before next().
    const phase = session.phase as Phase;
    if (phase === 'finished') {
      const result = session.result();
      const { isNewRecord } = ctx.storage.recordGame(result);
      nav.results(session, result, isNewRecord);
    } else {
      startQuestion();
    }
  }

  const unsubscribe = session.subscribe((_, fb) => fb && onFeedback(fb));
  if (config.mode === 'click') view.onPlaceClick((id) => session.answerByPlace(id));

  // Enter moves on while a result is shown (type mode keeps focus on the button).
  const onKey = (e: KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      session.phase === 'revealed' &&
      document.activeElement !== nextButton
    ) {
      e.preventDefault();
      next();
    }
  };
  document.addEventListener('keydown', onKey);

  startQuestion();

  return () => {
    window.clearInterval(tick);
    window.clearTimeout(autoNext);
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    view.onPlaceClick(null);
    view.highlight(null);
    hud.remove();
    panel.remove();
  };
}
