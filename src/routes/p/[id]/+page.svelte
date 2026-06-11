<script lang="ts">
	let { data } = $props();

	const expiresAt = $derived(
		new Intl.DateTimeFormat('id-ID', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(data.expiresAt * 1000))
	);
</script>

<svelte:head>
	<title>Foto Red Tulip</title>
	<meta name="description" content="Unduh hasil foto dari Red Tulip Photobox." />
</svelte:head>

<main class="shared-photo-page">
	<img class="brand-logo" src="/assets/logo.png" alt="Red Tulip" />
	<section class="shared-photo-card">
		<img class="shared-photo" src={`/p/${data.id}/file`} alt="Hasil foto Red Tulip Photobox" />
		<h1>foto kamu udah siap</h1>
		<p>Link ini aktif sampai {expiresAt} WIB.</p>
		<a class="primary-button" href={`/p/${data.id}/file?download=1`}>Unduh Foto</a>
	</section>
</main>

<style>
	.shared-photo-page {
		display: grid;
		min-height: 100svh;
		place-items: center;
		gap: 1.5rem;
		padding: 2rem 1rem 3rem;
	}

	.brand-logo {
		width: 7rem;
	}

	.shared-photo-card {
		display: grid;
		width: min(100%, 34rem);
		justify-items: center;
		border: 2px solid rgb(200 73 90 / 28%);
		border-radius: 1.5rem;
		background: rgb(255 255 255 / 38%);
		padding: 1rem 1rem 2.5rem;
		text-align: center;
		box-shadow: 0 10px 0 rgb(200 73 90 / 12%);
	}

	.shared-photo {
		width: 100%;
		max-height: 65svh;
		border-radius: 1rem;
		object-fit: contain;
		background: #24191b;
	}

	h1 {
		margin: 1.5rem 0 0;
		font-size: clamp(2rem, 8vw, 3.5rem);
		font-weight: 400;
		line-height: 0.95;
	}

	p {
		margin: 0.6rem 0 0;
		color: var(--color-sage);
	}
</style>
