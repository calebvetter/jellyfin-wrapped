<script lang="ts">
	let { text, label = 'Copy', variant = 'default' }: { text: string; label?: string; variant?: 'default' | 'ok' } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard API unavailable (e.g. plain http on LAN): fall back to a hidden textarea
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}
</script>

<button type="button" class="btn small" class:ok={variant === 'ok'} onclick={copy} aria-live="polite">{copied ? 'Copied ✓' : label}</button>

<style>
	.ok {
		background: rgba(79, 209, 139, 0.14);
		border-color: rgba(79, 209, 139, 0.4);
		color: var(--ok);
	}

	.ok:hover {
		border-color: var(--ok);
	}
</style>
