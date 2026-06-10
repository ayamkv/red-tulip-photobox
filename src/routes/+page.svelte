<script lang="ts">
	import { onMount } from 'svelte';
	import gsap from 'gsap';

	let hero: HTMLElement;
	const logoUrl = '/assets/logo.png';

	onMount(() => {
		const context = gsap.context(() => {
			gsap.from('[data-reveal]', {
				y: 24,
				opacity: 0,
				duration: 0.8,
				stagger: 0.1,
				ease: 'power3.out'
			});
		}, hero);

		return () => context.revert();
	});
</script>

<svelte:head>
	<title>Red Tulip</title>
	<meta name="description" content="Red Tulip photobox by berdasteran.co." />
</svelte:head>

<main bind:this={hero} class="home">
	<img data-reveal class="brand-logo" src={logoUrl} alt="Red Tulip" />

	<div class="brand-copy">
		<h1 data-reveal>Red Tulip</h1>
		<p data-reveal>berdasteran.co</p>
	</div>

	<a data-reveal class="primary-button" href="/photobox">Mulai Photobox</a>
</main>
