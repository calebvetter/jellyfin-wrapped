<script lang="ts">
	import Story from '$lib/story/Story.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Wrapped preview (mock data)</title></svelte:head>

{#key data.report}
	<Story report={data.report} music={data.music} customSfx={data.customSfx} preview sfxEnabled={data.sfxEnabled} startAt={data.startAt} hold={data.hold} badge="Mock preview" />
{/key}
