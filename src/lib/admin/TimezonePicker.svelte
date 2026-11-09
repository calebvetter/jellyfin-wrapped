<script lang="ts" module>
	/** Every IANA zone the runtime knows, with its current UTC offset (computed once). */
	interface Zone {
		value: string;
		label: string; // "America/Los Angeles"
		offset: string; // "UTC−8"
		search: string; // lowercased haystack
	}
	let zoneCache: Zone[] | null = null;
	function allZones(): Zone[] {
		if (zoneCache) return zoneCache;
		let names: string[] = [];
		try {
			names = Intl.supportedValuesOf('timeZone');
		} catch {
			/* very old runtime */
		}
		if (!names.includes('UTC')) names = [...names, 'UTC'];
		const now = new Date();
		zoneCache = names.map((value) => {
			let offset = 'UTC';
			try {
				const part = new Intl.DateTimeFormat('en-US', { timeZone: value, timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName');
				offset = (part?.value ?? 'GMT').replace('GMT', 'UTC').replace('-', '−') || 'UTC';
			} catch {
				/* keep UTC */
			}
			const label = value.replaceAll('_', ' ');
			return { value, label, offset, search: `${value} ${label} ${offset}`.toLowerCase() };
		});
		return zoneCache;
	}
</script>

<script lang="ts">
	/**
	 * Timezone combobox in the style of shadcn/ui: a button shows the selection; opening it
	 * reveals a popover with an empty search box over the full list (type to filter, arrow
	 * keys + Enter to pick, Esc to close). With `emptyLabel`, a first option selects '' (e.g.
	 * "use the default").
	 */
	import { tick } from 'svelte';

	interface Props {
		value: string;
		name?: string;
		label?: string;
		placeholder?: string;
		/** Adds a first option that selects '' (shown with this text). */
		emptyLabel?: string;
		/** Shorter text for the closed button when '' is selected (defaults to emptyLabel). */
		emptyShort?: string;
		/** Smaller trigger for table rows. */
		compact?: boolean;
		disabled?: boolean;
		/** Tooltip, e.g. why it's disabled. */
		title?: string;
		onchange?: (tz: string) => void;
	}
	let { value = $bindable(), name, label = 'Timezone', placeholder = 'Select a timezone…', emptyLabel, emptyShort, compact = false, disabled = false, title, onchange }: Props = $props();

	const uid = Math.random().toString(36).slice(2, 9);
	const zones = allZones();

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let root: HTMLDivElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();
	let search: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	// the popover is position: fixed (so a scrolling table or card can't clip it), placed
	// under the trigger, or above it when there isn't room below
	let pos = $state({ top: 0, left: 0, width: 0, up: false });
	const POP_HEIGHT = 360;

	function place() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const width = Math.min(Math.max(r.width, 256), window.innerWidth - 16);
		const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
		const below = window.innerHeight - r.bottom;
		const up = below < POP_HEIGHT && r.top > below;
		pos = { top: up ? r.top - 6 : r.bottom + 6, left, width, up };
	}

	type Option = { value: string; label: string; offset: string };
	const options = $derived.by((): Option[] => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		const matches = words.length ? zones.filter((z) => words.every((w) => z.search.includes(w))) : zones;
		return emptyLabel && !words.length ? [{ value: '', label: emptyLabel, offset: '' }, ...matches] : matches;
	});
	const selected = $derived(value ? zones.find((z) => z.value === value) : undefined);

	async function show() {
		if (disabled) return;
		place();
		open = true;
		query = '';
		active = Math.max(
			0,
			options.findIndex((o) => o.value === value)
		);
		await tick();
		search?.focus({ preventScroll: true });
		scrollToActive('center');
	}

	function hide(refocus = true) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function pick(o: Option) {
		const changed = o.value !== value;
		value = o.value;
		hide();
		if (changed) onchange?.(o.value);
	}

	/** Scroll only the list (scrollIntoView would also scroll the page). */
	function scrollToActive(mode: 'nearest' | 'center' = 'nearest') {
		const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
		if (!list || !el) return;
		const top = el.offsetTop;
		const bottom = top + el.offsetHeight;
		if (mode === 'center') list.scrollTop = top - (list.clientHeight - el.offsetHeight) / 2;
		else if (top < list.scrollTop) list.scrollTop = top - 4;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
	}

	async function move(delta: number) {
		if (!options.length) return;
		active = (active + delta + options.length) % options.length;
		await tick();
		scrollToActive();
	}

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			move(e.key === 'Home' ? -active : options.length - 1 - active);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (options[active]) pick(options[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			hide();
		} else if (e.key === 'Tab') {
			hide(false);
		}
	}

	$effect(() => {
		if (disabled && open) open = false; // e.g. the row was unchecked while open
	});

	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) hide(false);
		};
		// keep it attached to the trigger when the page or a table scrolls (not the list itself)
		const onScroll = (e: Event) => {
			if (list && e.target instanceof Node && list.contains(e.target)) return;
			place();
		};
		document.addEventListener('pointerdown', onDown);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', place);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', place);
		};
	});
</script>

<div class="combo" class:compact bind:this={root}>
	<button
		type="button"
		class="trigger"
		bind:this={trigger}
		aria-haspopup="listbox"
		aria-expanded={open}
		{disabled}
		{title}
		aria-label="{label}: {selected?.value ?? (emptyLabel && !value ? emptyLabel : placeholder)}"
		onclick={() => (open ? hide() : show())}
		onkeydown={(e) => {
			if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
				e.preventDefault();
				show();
			}
		}}
	>
		<span class="value" class:placeholder={!selected}>
			{#if selected}{selected.label}<span class="off">{selected.offset}</span>{:else}{emptyLabel && !value ? (emptyShort ?? emptyLabel) : placeholder}{/if}
		</span>
		<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
	</button>
	{#if name}<input type="hidden" {name} {value} />{/if}

	{#if open}
		<div class="pop" class:up={pos.up} style:top="{pos.top}px" style:left="{pos.left}px" style:width="{pos.width}px">
			<div class="search">
				<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
				<input
					bind:this={search}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="tz-list-{uid}"
					aria-activedescendant={options[active] ? `tz-${uid}-${active}` : undefined}
					aria-autocomplete="list"
					aria-label="Search timezones"
					placeholder="Search timezone or city…"
					autocomplete="off"
					spellcheck="false"
					onkeydown={onSearchKey}
					oninput={() => (active = 0)}
				/>
			</div>
			<ul id="tz-list-{uid}" role="listbox" aria-label={label} bind:this={list}>
				{#each options as o, i (o.value)}
					<!-- keyboard selection happens in the search box (aria-activedescendant); options only take clicks -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id="tz-{uid}-{i}"
						data-index={i}
						role="option"
						aria-selected={o.value === value}
						class:active={i === active}
						onpointermove={() => (active = i)}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => pick(o)}
					>
						<svg class="check" class:on={o.value === value} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
						<span class="lbl">{o.label}</span>
						{#if o.offset}<span class="off">{o.offset}</span>{/if}
					</li>
				{:else}
					<li class="empty" role="presentation">No timezone found.</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.combo {
		position: relative;
		display: inline-block;
		width: min(20rem, 100%);
	}

	.trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px 8px 12px;
		background: var(--panel-2);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: 8px;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.trigger:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.18);
	}
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.placeholder {
		color: var(--muted);
	}
	.chev {
		flex: none;
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.compact {
		width: 12rem;
	}
	.compact .trigger {
		padding: 5px 8px 5px 10px;
		font-size: 13px;
		border-radius: 7px;
	}

	.pop {
		position: fixed;
		z-index: 50;
		background: var(--panel);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		animation: pop-in 0.12s ease-out;
	}
	.pop.up {
		transform: translateY(-100%);
		animation-name: pop-in-up;
	}
	@keyframes pop-in-up {
		from {
			opacity: 0;
			transform: translateY(calc(-100% + 4px)) scale(0.98);
		}
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border-bottom: 1px solid var(--line);
	}
	.search svg {
		flex: none;
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
	}
	.search input {
		flex: 1;
		min-width: 0;
		padding: 11px 0;
		background: transparent;
		border: 0;
		outline: 0;
		color: var(--text);
		font: inherit;
	}
	.search input::placeholder {
		color: var(--muted);
	}

	ul {
		position: relative; /* offsetParent for scrollToActive */
		list-style: none;
		margin: 0;
		padding: 4px;
		max-height: 300px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		user-select: none;
	}
	li.active {
		background: rgba(255, 255, 255, 0.07);
	}
	li[aria-selected='true'] .lbl {
		font-weight: 600;
	}
	.lbl {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.off {
		flex: none;
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.check {
		flex: none;
		width: 15px;
		height: 15px;
		fill: none;
		stroke: var(--accent);
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
	}
	.check.on {
		opacity: 1;
	}
	.empty {
		justify-content: center;
		color: var(--muted);
		padding: 18px 8px;
		cursor: default;
	}
</style>
