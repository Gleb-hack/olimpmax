import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@olimp/ui';
import { useSession } from '../../lib/session';
import { onboardingPending, useOnboarding } from './onboarding-store';
import { tourSteps } from './tour-steps';

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const WAIT_MS = 4000;
const MARGIN = 12;
/** The card stays over the bottom navigation, which the tour never highlights. */
const DOCK = MARGIN + 84;
const last = tourSteps.length - 1;

function union(elements: Element[]): Rect | null {
  const rects = elements.map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const top = Math.min(...rects.map(rect => rect.top)), left = Math.min(...rects.map(rect => rect.left));
  const bottom = Math.max(...rects.map(rect => rect.bottom)), right = Math.max(...rects.map(rect => rect.right));
  return { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
}
const find = (selectors: string[] = []) => selectors.map(selector => document.querySelector(selector)).filter((element): element is Element => element !== null);

/** Starts the tour for a new account and runs it: the steps from tour-steps.ts over the real screens. */
export function OnboardingTour() {
  const { user } = useSession();
  const { active, step, start, go, finish } = useOnboarding();
  useEffect(() => { if (user && !active && onboardingPending(user)) start(); }, [user, active, start]);
  if (!active) return null;
  return createPortal(<Tour step={step} go={go} finish={() => finish(user)} />, document.body);
}

function Tour({ step, go, finish }: { step: number; go: (step: number) => void; finish: () => void }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const config = tourSteps[step]!;
  const [spot, setSpot] = useState<Rect | null>(null);
  const [fallback, setFallback] = useState(false);
  const [below, setBelow] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [cardHeight, setCardHeight] = useState(0);

  // The page under the tour does not scroll by hand; the tour scrolls it to each highlighted block.
  useEffect(() => {
    const root = document.documentElement, old = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = old; };
  }, []);

  useEffect(() => {
    if (config.route && pathname + search !== config.route) navigate(config.route, { replace: true });
  }, [config.route, pathname, search, navigate]);

  // Wait for the step's elements (the catalog and the plan load after navigation), bring them into view and follow them.
  useEffect(() => {
    setSpot(null); setFallback(false);
    if (!config.targets) { window.scrollTo({ top: 0 }); return; }
    let found: Element[] = [], alt = false, scrolled = false;
    const started = performance.now();
    const tick = () => {
      if (!found.length) {
        found = find(config.targets);
        if (!found.length && config.fallback) { found = find(config.fallback.targets); alt = found.length > 0; }
        if (!found.length) { if (performance.now() - started > WAIT_MS) window.scrollTo({ top: 0 }); return; }
        setFallback(alt);
      }
      if (!found.every(element => element.isConnected)) { found = []; return; }
      if (!scrolled) {
        scrolled = true;
        const box = union(found)!;
        window.scrollTo({ top: Math.max(0, window.scrollY + box.top - 72) });
      }
      const box = union(found);
      if (box) setSpot(current => current && Math.abs(current.top - box.top) < 0.5 && Math.abs(current.left - box.left) < 0.5
        && Math.abs(current.width - box.width) < 0.5 && Math.abs(current.height - box.height) < 0.5 ? current : box);
    };
    tick();
    const timer = window.setInterval(tick, 120);
    return () => window.clearInterval(timer);
  }, [step, config.targets, config.fallback]);

  useLayoutEffect(() => { setCardHeight(cardRef.current?.offsetHeight ?? 0); });
  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }); }, [step]);

  // The card goes under the highlight when the block fits above it, over it when the block fits under it.
  // A block taller than both (the whole overview) keeps the card below and is cut where the card begins.
  const card = cardHeight || 220;
  useEffect(() => {
    if (!spot) { setBelow(true); return; }
    const fitsAbove = spot.top + spot.height + card + DOCK + 24 <= window.innerHeight;
    setBelow(fitsAbove || spot.top < card + MARGIN * 2 + 24);
  }, [spot, card]);

  const next = useCallback(() => { if (step < last) go(step + 1); else { finish(); navigate('/olimp'); } }, [step, go, finish, navigate]);
  const prev = useCallback(() => { if (step > 0) go(step - 1); else finish(); }, [step, go, finish]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, finish]);
  useEffect(() => { tourBack.current = prev; return () => { tourBack.current = null; }; }, [prev]);

  // A tall block (the whole overview) is cut where the card begins.
  const viewport = window.innerHeight;
  const margin = MARGIN;
  let shown = spot;
  if (spot && cardHeight) {
    const top = Math.max(spot.top, below ? 8 : cardHeight + margin * 2 + 24);
    const bottom = Math.min(spot.top + spot.height, below ? viewport - DOCK - cardHeight - 24 : viewport - DOCK + 4);
    shown = bottom - top > 24 ? { ...spot, top, height: bottom - top } : spot;
  }
  const intro = step === 0, final = step === last, centered = !config.targets || (!spot && !fallback);
  const text = fallback && config.fallback ? config.fallback.text : config.text;
  const cardStyle: CSSProperties = centered || below ? { bottom: `calc(${DOCK}px + env(safe-area-inset-bottom))` } : { top: `max(${margin}px, env(safe-area-inset-top))` };
  const lineStyle: CSSProperties | undefined = shown && !centered ? below
    ? { top: shown.top + shown.height, height: Math.max(0, viewport - DOCK - cardHeight - (shown.top + shown.height)), left: shown.left + shown.width / 2 }
    : { top: margin + cardHeight, height: Math.max(0, shown.top - margin - cardHeight), left: shown.left + shown.width / 2 } : undefined;

  return <div className={`tour ${centered ? 'tour--centered' : ''} ${final ? 'tour--final' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
    <div className="tour__blocker" />
    {shown && !centered ? <div className="tour__spot" style={{ top: shown.top, left: shown.left, width: shown.width, height: shown.height }} aria-hidden="true" />
      : <div className="tour__scrim" aria-hidden="true" />}
    {lineStyle && <span key={`line-${step}`} className="tour__line" style={lineStyle} aria-hidden="true" />}
    <div ref={cardRef} className={`tour__dock ${centered ? 'tour__dock--hero' : ''}`} style={cardStyle}>
      <div key={step} className={`tour__card ${below || centered ? 'tour__card--from-below' : 'tour__card--from-above'}`}>
        <div className={`tour__mascot ${centered ? 'tour__mascot--hero' : ''}`} aria-hidden="true">
          {centered && <span className="tour__glow" />}
          {final && <span className="tour__confetti">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}</span>}
          <img src={config.mascot} alt="" />
        </div>
        <div className="tour__top">
          <span className="tour__chip">{final && <Icon name="check" size={11} />}{intro ? config.chip : final ? `${tourSteps.length} из ${tourSteps.length}` : `${step + 1} из ${tourSteps.length}`}</span>
          {!intro && !final && <button type="button" className="tour__skip" onClick={finish}>Пропустить</button>}
        </div>
        <h2 id="tour-title">{config.title}</h2>
        <p id="tour-text">{text}</p>
        {!intro && <ol className={`tour__dots ${final ? 'is-complete' : ''}`} aria-label={`Шаг ${step + 1} из ${tourSteps.length}`}>
          {tourSteps.slice(1).map((_, index) => <li key={index} className={index + 1 === step ? 'is-current' : index + 1 < step || final ? 'is-done' : ''} />)}
        </ol>}
        <div className={`tour__actions ${intro || final ? 'tour__actions--pair' : ''}`}>
          {intro && <button type="button" className="tour__button tour__button--outline" onClick={finish}>Пропустить</button>}
          {final && <button type="button" className="tour__button tour__button--outline" onClick={finish}>Закрыть</button>}
          {!intro && !final && step > 1 && <button type="button" className="tour__back" aria-label="Предыдущий шаг" onClick={prev}><Icon name="chevron-left" size={16} /></button>}
          <button ref={primaryRef} type="button" className="tour__button" onClick={next}>{config.primary}</button>
        </div>
      </div>
    </div>
  </div>;
}

/** MAX «back» during the tour: the previous step (Layout reads this). */
export const tourBack: { current: (() => void) | null } = { current: null };
