<script lang="ts">
	import Experience from '$lib/story/Experience.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Preview · {data.userName}</title></svelte:head>

<div class="preview-root">
	<Experience {...data} preview badge="Admin preview" yearLinkBase="/admin/preview/{data.userId}" />
	<a class="back" href="/admin/users/{data.userId}">← Back to admin</a>
</div>

<style>
	.back {
		position: fixed;
		z-index: 50;
		left: 16px;
		bottom: 16px;
		padding: 8px 14px;
		border-radius: 99px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 13px;
		text-decoration: none;
		backdrop-filter: blur(8px);
	}
</style>
