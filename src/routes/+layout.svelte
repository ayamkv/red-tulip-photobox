<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/assets/logo.png" />
	<meta name="theme-color" content="#fef4da" />
</svelte:head>
{@render children()}
