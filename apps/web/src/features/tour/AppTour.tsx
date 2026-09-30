import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@olimp/ui';
import { usePlan } from '../../lib/queries';
import { tourSteps, type TourStep } from './tour-steps';
import { useTour } from './tour-state';
import pointerDot from '../../assets/onboarding/pointer-dot.svg';
import circleCheck from '../../assets/onboarding/circle-check.svg';
import confettiDot1 from '../../assets/onboarding/confetti-dot-1.svg';
import confettiDot2 from '../../assets/onboarding/confetti-dot-2.svg';
import finaleStar from '../../assets/onboarding/finale-star.svg';
import finaleSparkles from '../../assets/onboarding/finale-sparkles.svg';

type Box = { top: number; left: number; width: number; height: number };
type Layout = { index: number; spot: Box | null; card: { top: number; left: number; width: number }; pointer: { x: number; top: number; height: number; dot: number } | null };

const CARD_WIDTH = 343;
const SPOT_PADDING = 6;
const GAP_ABOVE = 32;
/** Room over a card placed above the highlight: the mascot peeks out from behind it. */
const MASCOT_ROOM = 84;
/** How long a step waits for all its elements (the catalog and the plan load from the API) before it makes do with some or the fallback. */
const ANCHOR_WAIT = 1500;
/** Elements that show up later than that (a slow network) still get scrolled into place until then. */
const LATE_ANCHORS = 8000;

function findAnchors(names: string[] | undefined) {
  return (names ?? []).map(name => document.querySelector<HTMLElement>(`[data-tour="${name}"]`)).filter((element): element is HTMLElement => Boolean(element?.getClientRects().length));
}
function unionBox(elements: HTMLElement[], width: number): Box {
  const rects = elements.map(element => element.getBoundingClientRect());
  const top = Math.min(...rects.map(rect => rect.top)) - SPOT_PADDING;
  const bottom = Math.max(...rects.map(rect => rect.bottom)) + SPOT_PADDING;
  const left = Math.max(8, Math.min(...rects.map(rect => rect.left)) - SPOT_PADDING);
  const right = Math.min(width - 8, Math.max(...rects.map(rect => rect.right)) + SPOT_PADDING);
  return { top, left, width: right - left, height: bottom - top };
}
/** The element that scrolls the highlighted content: a dialog body or the page itself (null). */
function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
const round = (box: Box): Box => ({ top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) });

/**
 * The app tour: 11 steps over the live screens (Figma «Старт», «2»…«11»). It dims the app, cuts out the element it
 * explains, points at it from a hint card and walks the pupil through Олимп, Каталог, План and Профиль.
 * A modal <dialog> keeps it above the app's own dialogs (the plan item in step 9) and makes the app inert meanwhile.
 */
export function AppTour() {
  const step = useTour(state => state.step);
  const pending = useTour(state => state.pending);
  const go = useTour(state => state.go);
  // A tour left unfinished (the app was closed) starts again from the beginning.
  useEffect(() => { if (pending && step === null) go(0); }, [pending, step, go]);
  return step === null ? null : <TourOverlay index={Math.min(step, tourSteps.length - 1)} />;
}

function TourOverlay({ index }: { index: number }) {
  const step = tourSteps[index]!;
  const go = useTour(state => state.go);
  const finish = useTour(state => state.finish);
  const navigate = useNavigate();
  const plan = usePlan();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const titleId = useId();
  const textId = useId();
  const planId = plan.data?.items[0]?.olympiad.id;
  const route = step.route === 'plan-item' ? planId ? `/plan?olympiad=${planId}` : '/plan' : step.route;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (window.location.pathname + window.location.search !== route) navigate(route);
  }, [route, navigate]);

  // Every frame: find the step's elements, scroll them into place once, and follow them as the page settles.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const started = performance.now();
    let scrolled = false;
    let scrolledFor = 0;
    let otherDialogs = 0;
    let last = '';
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      // An app dialog opened under the tour (the plan item) goes to the top layer: bring the tour back above it.
      const open = document.querySelectorAll('dialog[open]').length - (dialog.open ? 1 : 0);
      if (open > otherDialogs && dialog.open) { dialog.close(); dialog.showModal(); }
      otherDialogs = open;

      const width = dialog.clientWidth;
      const height = dialog.clientHeight;
      const style = getComputedStyle(dialog);
      const topEdge = (parseFloat(style.paddingTop) || 0) + 12;
      const bottomEdge = height - (parseFloat(style.paddingBottom) || 0) - 16;
      const cardHeight = cardRef.current?.offsetHeight ?? 200;
      const cardWidth = Math.min(CARD_WIDTH, width - 32);
      const cardLeft = (width - cardWidth) / 2;
      const here = window.location.pathname + window.location.search === route;
      const elapsed = performance.now() - started;
      const found = here ? findAnchors(step.anchors) : [];
      const complete = found.length === (step.anchors?.length ?? 0);
      const elements = complete ? found : elapsed < ANCHOR_WAIT ? [] : found.length ? found : findAnchors(step.fallback);

      let next: Layout;
      if (!elements.length) {
        // Intro, finale, or nothing to point at: the card rests low with the mascot over it.
        if (!scrolled && step.kind !== 'hint') { scrolled = true; window.scrollTo({ top: 0, behavior: 'instant' }); }
        const lift = Math.max(0, Math.min(84, height - 640));
        next = { index, spot: null, card: { top: bottomEdge - cardHeight - lift, left: cardLeft, width: cardWidth }, pointer: null };
      } else {
        const box = unionBox(elements, width);
        if (!scrolled || (elements.length > scrolledFor && elapsed < LATE_ANCHORS)) {
          scrolled = true;
          scrolledFor = elements.length;
          const target = step.placement === 'above' ? topEdge + MASCOT_ROOM + cardHeight + GAP_ABOVE : topEdge + 60;
          const delta = box.top - target;
          const parent = scrollParent(elements[0]!);
          if (parent) parent.scrollTop += delta; else window.scrollBy({ top: delta, behavior: 'instant' });
          return;
        }
        const bottom = box.top + box.height;
        let above = step.placement === 'above';
        if (above && box.top - GAP_ABOVE - cardHeight < topEdge) above = false;
        if (!above && bottom > bottomEdge - cardHeight - 44 && box.top - GAP_ABOVE - cardHeight >= topEdge && box.top > height / 2) above = true;
        // Below: the card rests at the bottom of the screen, so the mascot stands in the gap instead of over the highlight.
        const cardTop = above ? box.top - GAP_ABOVE - cardHeight : bottomEdge - cardHeight;
        // The highlight never runs under the card: a tall area is cut at the card, the pointer still reaches it.
        const spotTop = Math.max(box.top, above ? cardTop + cardHeight + 12 : topEdge);
        const spotBottom = Math.min(bottom, above ? bottomEdge : cardTop - 20);
        const spot = spotBottom - spotTop >= 24 ? { top: spotTop, left: box.left, width: box.width, height: spotBottom - spotTop } : null;
        let pointer: Layout['pointer'] = null;
        if (spot) {
          const x = Math.min(Math.max(spot.left + spot.width / 2, cardLeft + 28), cardLeft + cardWidth - 28);
          const from = above ? cardTop + cardHeight : spot.top + spot.height;
          const to = above ? spot.top : cardTop;
          if (to - from >= 8) pointer = { x: Math.round(x), top: Math.round(from), height: Math.round(to - from), dot: Math.round(above ? to : from) };
        }
        next = { index, spot: spot && round(spot), card: { top: Math.round(cardTop), left: Math.round(cardLeft), width: Math.round(cardWidth) }, pointer };
      }
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setLayout(next); }
    });
    return () => cancelAnimationFrame(frame);
  }, [index, route, step]);

  const current = layout?.index === index ? layout : null;
  const next = () => go(index + 1);
  const spot = current?.spot ?? null;
  const spotStyle: CSSProperties = spot ? { top: spot.top, left: spot.left, width: spot.width, height: spot.height } : {};
  return <dialog ref={dialogRef} className={`tour ${step.kind !== 'hint' ? 'tour--soft' : ''}`} aria-labelledby={titleId} aria-describedby={textId}
    onCancel={event => { event.preventDefault(); finish(); }}>
    <div className={`tour-spot ${spot ? '' : 'is-empty'}`} style={spotStyle} aria-hidden="true" />
    {current?.pointer && <div key={`pointer-${index}`} className="tour-pointer" style={{ left: current.pointer.x - 1, top: current.pointer.top, height: current.pointer.height }} aria-hidden="true">
      <img src={pointerDot} width={8} height={8} alt="" style={{ top: current.pointer.dot - current.pointer.top - 4 }} />
    </div>}
    <div key={index} className={`tour-card-wrap ${current ? 'is-ready' : ''}`} style={current ? { top: current.card.top, left: current.card.left, width: current.card.width } : { width: Math.min(CARD_WIDTH, window.innerWidth - 32) }}>
      {step.kind === 'finale' && <FinaleDecor />}
      <TourBuddy step={step} />
      <div ref={cardRef} className={`tour-card tour-card--${step.kind}`}>
        <div className="tour-card__top">
          {step.kind === 'intro' ? <span className="tour-badge">Знакомство</span>
            : step.kind === 'finale' ? <span className="tour-badge"><img src={circleCheck} width={13} height={13} alt="" />{tourSteps.length} из {tourSteps.length}</span>
            : <><span className="tour-badge">{index + 1} из {tourSteps.length}</span><button type="button" className="tour-skip" onClick={finish}>Пропустить</button></>}
        </div>
        <h2 id={titleId}>{step.title}</h2>
        <p id={textId}>{step.text}</p>
        {step.kind === 'hint' ? <div className="tour-card__footer"><TourDots index={index} /><Button className="tour-next" onClick={next}>{step.action}</Button></div>
          : <>
            {step.kind === 'finale' && <TourDots index={index} done />}
            <div className="tour-card__actions">
              <Button variant="secondary" className="tour-pill tour-pill--outline" onClick={finish}>{step.kind === 'intro' ? 'Пропустить' : 'Закрыть'}</Button>
              <Button className="tour-pill" onClick={step.kind === 'intro' ? next : () => { finish(); navigate('/olimp'); window.scrollTo({ top: 0, behavior: 'instant' }); }}>{step.action}</Button>
            </div>
          </>}
      </div>
    </div>
  </dialog>;
}

function TourBuddy({ step }: { step: TourStep }) {
  const { mascot } = step;
  const position: CSSProperties = mascot.center !== undefined ? { left: `calc(50% + ${mascot.center - mascot.width / 2}px)` }
    : mascot.left !== undefined ? { left: mascot.left } : { right: mascot.right };
  return <div className="tour-buddy" style={{ ...position, top: mascot.top, width: mascot.width, height: mascot.height }} aria-hidden="true">
    <img className="tour-buddy__glow" src={mascot.glow.src} width={mascot.glow.width} height={mascot.glow.height} style={{ left: mascot.glow.left, top: mascot.glow.top }} alt="" />
    <img className="tour-buddy__mascot" src={mascot.src} width={mascot.width} height={mascot.height} alt="" />
  </div>;
}

function TourDots({ index, done = false }: { index: number; done?: boolean }) {
  return <div className={`tour-dots ${done ? 'tour-dots--done' : ''}`} aria-hidden="true">
    {tourSteps.map((_, dot) => <span key={dot} className={dot === index ? 'is-active' : ''} />)}
  </div>;
}

/** Confetti, a star and sparkles around the mascot on the last step (Figma «11»), placed against the 343 px card. */
function FinaleDecor() {
  const at = (left: number, top: number): CSSProperties => ({ left: `${(left / CARD_WIDTH) * 100}%`, top });
  return <div className="tour-confetti" aria-hidden="true">
    <img src={confettiDot1} width={8} height={8} alt="" style={at(323, -113)} />
    <img src={confettiDot2} width={9} height={9} alt="" style={at(8, -67)} />
    <span className="tour-confetti__strip tour-confetti__strip--violet" style={at(301.6, -82.5)} />
    <span className="tour-confetti__strip tour-confetti__strip--yellow" style={at(39.8, -100.5)} />
    <img className="tour-confetti__star" src={finaleStar} width={19} height={19} alt="" style={at(279, -200)} />
    <img className="tour-confetti__sparkles" src={finaleSparkles} width={24} height={24} alt="" style={at(61, -195)} />
  </div>;
}
