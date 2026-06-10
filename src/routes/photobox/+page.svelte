<script lang="ts">
	import { onMount } from 'svelte';

	const frameUrl = '/assets/camboxframe1.png';
	let video = $state<HTMLVideoElement>();
	let canvas = $state<HTMLCanvasElement>();
	let stream: MediaStream | null = null;
	let photoUrl = $state('');
	let cameraReady = $state(false);
	let cameraError = $state('');

	async function startCamera() {
		cameraError = '';
		const videoElement = video;

		if (!videoElement || !navigator.mediaDevices?.getUserMedia) {
			cameraError = 'Browser ini belum mendukung akses kamera.';
			return;
		}

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
				audio: false
			});
			videoElement.srcObject = stream;
			await videoElement.play();
			cameraReady = true;
		} catch {
			cameraError = 'Kamera belum bisa dibuka. Izinkan akses kamera lalu coba lagi.';
		}
	}

	function takePhoto() {
		if (!cameraReady || !video || !canvas || !video.videoWidth || !video.videoHeight) return;

		const canvasElement = canvas;
		const width = 1134;
		const height = 660;
		const context = canvasElement.getContext('2d');
		if (!context) return;

		canvasElement.width = width;
		canvasElement.height = height;

		const sourceRatio = video.videoWidth / video.videoHeight;
		const targetRatio = width / height;
		let sourceWidth = video.videoWidth;
		let sourceHeight = video.videoHeight;
		let sourceX = 0;
		let sourceY = 0;

		if (sourceRatio > targetRatio) {
			sourceWidth = video.videoHeight * targetRatio;
			sourceX = (video.videoWidth - sourceWidth) / 2;
		} else {
			sourceHeight = video.videoWidth / targetRatio;
			sourceY = (video.videoHeight - sourceHeight) / 2;
		}

		context.save();
		context.translate(width, 0);
		context.scale(-1, 1);
		context.drawImage(
			video,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			0,
			0,
			width,
			height
		);
		context.restore();

		const frame = new Image();
		frame.onload = () => {
			context.drawImage(frame, 0, 0, width, height);
			photoUrl = canvasElement.toDataURL('image/png');
		};
		frame.src = frameUrl;
	}

	function retake() {
		photoUrl = '';
	}

	onMount(() => {
		startCamera();

		return () => {
			stream?.getTracks().forEach((track) => track.stop());
		};
	});
</script>

<svelte:head>
	<title>Photobox | Red Tulip</title>
	<meta name="description" content="Take a photo with the Red Tulip photobox frame." />
</svelte:head>

<main class="photobox-page">
	<header>
		<a href="/" aria-label="Kembali ke halaman utama">← Red Tulip</a>
		<div>
			<h1>Photobox</h1>
			<p>siap, lihat kamera, lalu ambil fotonya.</p>
		</div>
	</header>

	<section class="camera-shell" aria-live="polite">
		{#if photoUrl}
			<img class="photo-result" src={photoUrl} alt="Potret Red Tulip kamu" />
		{:else}
			<div class="camera-view">
				<video bind:this={video} playsinline muted aria-label="Pratinjau kamera"></video>
				<img class="camera-frame" src={frameUrl} alt="" aria-hidden="true" />

				{#if !cameraReady && !cameraError}
					<p class="camera-message">Membuka kamera...</p>
				{/if}

				{#if cameraError}
					<div class="camera-message camera-error">
						<p>{cameraError}</p>
						<button class="secondary-button" type="button" onclick={startCamera}>Coba Lagi</button>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<div class="camera-actions">
		{#if photoUrl}
			<button class="secondary-button" type="button" onclick={retake}>Foto Ulang</button>
			<a class="primary-button" href={photoUrl} download="red-tulip-photobox.png">Unduh Foto</a>
		{:else}
			<button class="primary-button" type="button" onclick={takePhoto} disabled={!cameraReady}>
				Ambil Foto
			</button>
		{/if}
	</div>

	<canvas bind:this={canvas} hidden></canvas>
</main>

<style>
	.photobox-page {
		width: min(100%, 76rem);
		min-height: 100svh;
		margin: 0 auto;
		padding: clamp(1.25rem, 4vw, 3rem);
	}

	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 1.5rem;
	}

	header a {
		color: var(--color-sage);
		text-decoration: none;
	}

	header div {
		text-align: right;
	}

	h1 {
		margin: 0;
		font-size: clamp(3rem, 8vw, 5.5rem);
		font-weight: 400;
		line-height: 0.9;
	}

	header p {
		margin: 0.5rem 0 0;
		color: var(--color-sage);
		font-size: 1.1rem;
	}

	.camera-shell {
		overflow: hidden;
		width: 100%;
		aspect-ratio: 1134 / 660;
		border: 3px solid var(--color-tulip);
		border-radius: 1.25rem;
		background: #24191b;
		box-shadow: 0 12px 0 rgb(200 73 90 / 18%);
	}

	.camera-view {
		position: relative;
		width: 100%;
		height: 100%;
	}

	video,
	.photo-result {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	video {
		transform: scaleX(-1);
	}

	.camera-frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.camera-message {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 1.5rem;
		background: rgb(36 25 27 / 72%);
		color: var(--color-cream);
		text-align: center;
	}

	.camera-error {
		align-content: center;
		gap: 1rem;
	}

	.camera-error p {
		margin: 0;
	}

	.camera-error .secondary-button {
		border-color: var(--color-cream);
		color: var(--color-cream);
	}

	.camera-actions {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}

	.camera-actions :global(.primary-button) {
		margin-top: 0;
	}

	@media (max-width: 640px) {
		header {
			display: block;
		}

		header div {
			margin-top: 1.5rem;
			text-align: left;
		}

		.camera-shell {
			border-radius: 0.75rem;
		}

		.camera-actions {
			flex-direction: column;
		}
	}
</style>
