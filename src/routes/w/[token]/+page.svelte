<script lang="ts">
	import Experience from '$lib/story/Experience.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.report ? `${data.report.year} Wrapped` : 'Wrapped'}</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<Experience {...data} />
