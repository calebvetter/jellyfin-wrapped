import { gsap } from 'gsap';
import { fmt } from './format';

/** Animate a number counting up inside `el`. */
export function countUp(
	tl: gsap.core.Timeline,
	el: Element | null | undefined,
	to: number,
	opts: { duration?: number; at?: gsap.Position; format?: (n: number) => string; ease?: string; onTick?: () => void } = {}
) {
	if (!el) return;
	const o = { v: 0 };
	const format = opts.format ?? fmt;
	el.textContent = format(0);
	let lastShown = '';
	tl.to(
		o,
		{
			v: to,
			duration: opts.duration ?? 1.6,
			ease: opts.ease ?? 'power2.out',
			onUpdate() {
				const s = format(o.v);
				if (s !== lastShown) {
					lastShown = s;
					el.textContent = s;
					opts.onTick?.();
				}
			},
			onComplete() {
				el.textContent = format(to);
			}
		},
		opts.at
	);
}

/** Burst of confetti pieces from a point inside `container` (percent coordinates). */
export function confetti(
	tl: gsap.core.Timeline,
	container: HTMLElement,
	at: gsap.Position,
	opts: { count?: number; colors?: string[]; x?: number; y?: number; spread?: number } = {}
) {
	const colors = opts.colors ?? ['#c6f432', '#ff3ea5', '#2de2e6', '#ffe14d', '#ff6a13', '#ffffff'];
	const count = opts.count ?? 36;
	const pieces: HTMLElement[] = [];
	for (let i = 0; i < count; i++) {
		const p = document.createElement('i');
		const size = 6 + Math.random() * 10;
		const round = Math.random() > 0.6;
		Object.assign(p.style, {
			position: 'absolute',
			left: `${opts.x ?? 50}%`,
			top: `${opts.y ?? 50}%`,
			width: `${size}px`,
			height: `${round ? size : size * 0.45}px`,
			background: colors[i % colors.length],
			borderRadius: round ? '50%' : '2px',
			pointerEvents: 'none',
			opacity: '0',
			zIndex: '30'
		});
		container.appendChild(p);
		pieces.push(p);
	}
	const spread = opts.spread ?? 1;
	tl.add(() => {
		for (const p of pieces) {
			const angle = Math.random() * Math.PI * 2;
			const dist = (120 + Math.random() * 220) * spread;
			gsap.fromTo(
				p,
				{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 },
				{
					x: Math.cos(angle) * dist,
					y: Math.sin(angle) * dist * 0.7 + 260,
					rotate: Math.random() * 720 - 360,
					opacity: 0,
					duration: 1.6 + Math.random() * 1.2,
					ease: 'power2.out'
				}
			);
		}
	}, at);
}

/** Wrap each character of an element's text in spans (keeps words together). */
export function splitChars(el: Element | null | undefined): HTMLElement[] {
	if (!el) return [];
	const text = el.textContent ?? '';
	el.textContent = '';
	const out: HTMLElement[] = [];
	for (const word of text.split(/(\s+)/)) {
		if (/^\s+$/.test(word)) {
			el.appendChild(document.createTextNode(word));
			continue;
		}
		const w = document.createElement('span');
		w.style.display = 'inline-block';
		w.style.whiteSpace = 'nowrap';
		for (const ch of word) {
			const s = document.createElement('span');
			s.textContent = ch;
			s.style.display = 'inline-block';
			w.appendChild(s);
			out.push(s);
		}
		el.appendChild(w);
	}
	return out;
}

/**
 * Function-based GSAP values that start an element fully outside the slide, whatever the
 * frame size: use as `y: offAbove(root)` / `y: offBelow(root)` / `x: offRight(root)` in from().
 */
export const offAbove =
	(root: Element, margin = 40) =>
	(_i: number, el: Element) =>
		-(el.getBoundingClientRect().bottom - root.getBoundingClientRect().top + margin);

export const offBelow =
	(root: Element, margin = 40) =>
	(_i: number, el: Element) =>
		root.getBoundingClientRect().bottom - el.getBoundingClientRect().top + margin;

export const offRight =
	(root: Element, margin = 40) =>
	(_i: number, el: Element) =>
		root.getBoundingClientRect().right - el.getBoundingClientRect().left + margin;
