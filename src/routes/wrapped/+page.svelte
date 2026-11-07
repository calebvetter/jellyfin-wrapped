<script lang="ts">
	import Experience from '$lib/story/Experience.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.report ? `${data.report.year} Wrapped` : 'Wrapped'}</title></svelte:head>

<Experience {...data} showSignOut yearLinkBase="/wrapped" />
