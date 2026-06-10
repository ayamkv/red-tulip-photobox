<script lang="ts">
	import { onMount } from 'svelte';

	type FilterId = 'natural' | 'warm' | 'mono' | 'dreamy';
	type SignaturePosition = 'left' | 'center' | 'right';
	type SignatureColor = 'cream' | 'pink' | 'dark';
	type FacingMode = 'user' | 'environment';
	type FrameFormat = 'landscape' | 'portrait';

	const frames: Record<
		FrameFormat,
		{ label: string; url: string; width: number; height: number }
	> = {
		landscape: {
			label: 'Landscape',
			url: '/assets/camboxframe1.png',
			width: 1134,
			height: 660
		},
		portrait: {
			label: 'Portrait',
			url: '/assets/camboxframe1vertical.png',
			width: 1080,
			height: 1920
		}
	};
	const filters: Array<{ id: FilterId; label: string; css: string }> = [
		{ id: 'natural', label: 'Natural', css: 'none' },
		{ id: 'warm', label: 'Warm', css: 'sepia(0.22) saturate(1.18) contrast(1.04)' },
		{ id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.08)' },
		{ id: 'dreamy', label: 'Dreamy', css: 'saturate(1.12) brightness(1.08) contrast(0.92)' }
	];
	const signatureColors: Record<SignatureColor, string> = {
		cream: '#fef4da',
		pink: '#fd72b6',
		dark: '#4b292f'
	};

	let video = $state<HTMLVideoElement>();
	let canvas = $state<HTMLCanvasElement>();
	let stream: MediaStream | null = null;
	let demoCanvas: HTMLCanvasElement | null = null;
	let photoUrl = $state('');
	let cameraReady = $state(false);
	let cameraError = $state('');
	let isCapturing = $state(false);
	let showSettings = $state(true);
	let selectedFilter = $state<FilterId>('natural');
	let brightness = $state(100);
	let facingMode = $state<FacingMode>('user');
	let mirrorPhoto = $state(true);
	let timerSeconds = $state(3);
	let countdown = $state(0);
	let frameFormat = $state<FrameFormat>('landscape');
	let signature = $state('');
	let signaturePosition = $state<SignaturePosition>('center');
	let signatureColor = $state<SignatureColor>('cream');

	let activeFilter = $derived(filters.find((filter) => filter.id === selectedFilter) ?? filters[0]);
	let activeFrame = $derived(frames[frameFormat]);
	let previewFilter = $derived(
		`${activeFilter.css === 'none' ? '' : activeFilter.css} brightness(${brightness}%)`.trim()
	);

	function stopCamera() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		demoCanvas = null;
		cameraReady = false;
	}

	function createDemoStream() {
		demoCanvas = document.createElement('canvas');
		demoCanvas.width = 1280;
		demoCanvas.height = 720;
		const context = demoCanvas.getContext('2d');
		if (!context) throw new Error('Demo canvas unavailable');

		const gradient = context.createLinearGradient(0, 0, 1280, 720);
		gradient.addColorStop(0, '#fb90c3');
		gradient.addColorStop(0.5, '#fef4da');
		gradient.addColorStop(1, '#7bb486');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 1280, 720);
		context.fillStyle = '#c8495a';
		context.beginPath();
		context.arc(640, 320, 170, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = '#fef4da';
		context.font = "72px 'Instrument Serif', serif";
		context.textAlign = 'center';
		context.fillText('Red Tulip', 640, 345);

		return demoCanvas.captureStream(1);
	}

	async function startCamera() {
		stopCamera();
		cameraError = '';
		const videoElement = video;

		if (!videoElement || !navigator.mediaDevices?.getUserMedia) {
			cameraError = 'Browser ini belum mendukung akses kamera.';
			return;
		}

		try {
			const useDemoCamera =
				import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
			stream = useDemoCamera
				? createDemoStream()
				: await navigator.mediaDevices.getUserMedia({
						video: {
							facingMode: { ideal: facingMode },
							width: { ideal: 1280 },
							height: { ideal: 720 }
						},
						audio: false
					});
			videoElement.srcObject = stream;
			await videoElement.play();
			stream.getVideoTracks()[0]?.addEventListener(
				'ended',
				() => {
					cameraReady = false;
					cameraError = 'Kamera terputus. Sambungkan kembali lalu coba lagi.';
				},
				{ once: true }
			);
			cameraReady = true;
		} catch {
			stopCamera();
			cameraError = 'Kamera belum bisa dibuka. Izinkan akses kamera lalu coba lagi.';
		}
	}

	async function changeCamera(event: Event) {
		facingMode = (event.currentTarget as HTMLSelectElement).value as FacingMode;
		await startCamera();
	}

	function wait(milliseconds: number) {
		return new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	async function loadImage(url: string) {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject();
			image.src = url;
		});
		return image;
	}

	function drawSignature(context: CanvasRenderingContext2D, width: number, height: number) {
		const text = signature.trim();
		if (!text) return;

		const positions: Record<SignaturePosition, { x: number; align: CanvasTextAlign }> = {
			left: { x: width * 0.12, align: 'left' },
			center: { x: width * 0.5, align: 'center' },
			right: { x: width * 0.88, align: 'right' }
		};
		const position = positions[signaturePosition];

		context.save();
		context.font = "58px 'Mea Culpa', cursive";
		context.textAlign = position.align;
		context.textBaseline = 'middle';
		context.fillStyle = signatureColors[signatureColor];
		context.shadowColor = 'rgb(36 25 27 / 55%)';
		context.shadowBlur = 8;
		context.shadowOffsetY = 3;
		context.fillText(text, position.x, height * 0.76, width * 0.55);
		context.restore();
	}

	async function takePhoto() {
		if (
			isCapturing ||
			!cameraReady ||
			!video ||
			!canvas ||
			!video.videoWidth ||
			!video.videoHeight
		) {
			return;
		}

		isCapturing = true;
		cameraError = '';

		try {
			for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
				countdown = remaining;
				await wait(1000);
			}
			countdown = 0;

			const canvasElement = canvas;
			const { width, height } = activeFrame;
			const context = canvasElement.getContext('2d');
			if (!context) throw new Error('Canvas unavailable');

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
			context.filter = previewFilter;
			if (mirrorPhoto) {
				context.translate(width, 0);
				context.scale(-1, 1);
			}
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

			const frame = await loadImage(activeFrame.url);
			context.drawImage(frame, 0, 0, width, height);
			await document.fonts.load("58px 'Mea Culpa'");
			drawSignature(context, width, height);
			photoUrl = canvasElement.toDataURL('image/png');
		} catch {
			cameraError = 'Foto gagal diproses. Muat ulang halaman lalu coba lagi.';
		} finally {
			countdown = 0;
			isCapturing = false;
		}
	}

	function retake() {
		photoUrl = '';
	}

	function resetSettings() {
		selectedFilter = 'natural';
		brightness = 100;
		facingMode = 'user';
		mirrorPhoto = true;
		timerSeconds = 3;
		frameFormat = 'landscape';
		signature = '';
		signaturePosition = 'center';
		signatureColor = 'cream';
		startCamera();
	}

	onMount(() => {
		startCamera();
		return stopCamera;
	});
</script>

<svelte:head>
	<title>Photobox | Red Tulip</title>
	<meta
		name="description"
		content="Ambil foto dengan filter, bingkai, dan tanda tangan Red Tulip."
	/>
</svelte:head>

<main class="photobox-page">
	<header>
		<a href="/" aria-label="Kembali ke halaman utama">← Red Tulip</a>
		<div>
			<h1>Photobox</h1>
			<p>atur gayamu, lalu ambil fotonya.</p>
		</div>
	</header>

	<div class="photobox-layout">
		<div class:portrait={frameFormat === 'portrait'} class="camera-column">
			<section
				class:portrait={frameFormat === 'portrait'}
				class="camera-shell"
				aria-live="polite"
			>
				{#if photoUrl}
					<img class="photo-result" src={photoUrl} alt="Potret Red Tulip kamu" />
				{:else}
					<div class="camera-view">
						<video
							bind:this={video}
							playsinline
							muted
							aria-label="Pratinjau kamera"
							style:filter={previewFilter}
							class:mirrored={mirrorPhoto}
						></video>
						<img class="camera-frame" src={activeFrame.url} alt="" aria-hidden="true" />

						{#if signature.trim()}
							<p
								class="signature-preview signature-{signaturePosition}"
								style:color={signatureColors[signatureColor]}
							>
								{signature.trim()}
							</p>
						{/if}

						{#if countdown > 0}
							<p class="countdown" aria-label={`Foto diambil dalam ${countdown}`}>{countdown}</p>
						{/if}

						{#if !cameraReady && !cameraError}
							<p class="camera-message">Membuka kamera...</p>
						{/if}

						{#if cameraError}
							<div class="camera-message camera-error">
								<p>{cameraError}</p>
								<button class="secondary-button" type="button" onclick={startCamera}>
									Coba Lagi
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<div class="camera-actions">
				{#if photoUrl}
					<button class="secondary-button" type="button" onclick={retake}>Foto Ulang</button>
					<a class="primary-button" href={photoUrl} download="red-tulip-photobox.png">
						Unduh Foto
					</a>
				{:else}
					<button
						class="primary-button"
						type="button"
						onclick={takePhoto}
						disabled={!cameraReady || isCapturing}
					>
						{isCapturing ? (countdown > 0 ? `Siap... ${countdown}` : 'Memproses...') : 'Ambil Foto'}
					</button>
				{/if}
			</div>
		</div>

		<aside class:settings-open={showSettings} class="settings-panel">
			<button
				class="settings-toggle"
				type="button"
				aria-expanded={showSettings}
				onclick={() => (showSettings = !showSettings)}
			>
				<span>Pengaturan</span>
				<span aria-hidden="true">{showSettings ? '−' : '+'}</span>
			</button>

			{#if showSettings}
				<div class="settings-content">
					<fieldset>
						<legend>Filter</legend>
						<div class="filter-grid">
							{#each filters as filter}
								<button
									class:active={selectedFilter === filter.id}
									type="button"
									aria-pressed={selectedFilter === filter.id}
									onclick={() => (selectedFilter = filter.id)}
								>
									<span class="filter-swatch" style:filter={filter.css}></span>
									{filter.label}
								</button>
							{/each}
						</div>
					</fieldset>

					<fieldset>
						<legend>Format</legend>
						<div class="format-options">
							{#each Object.entries(frames) as [format, frame]}
								<button
									class:active={frameFormat === format}
									type="button"
									aria-pressed={frameFormat === format}
									onclick={() => (frameFormat = format as FrameFormat)}
								>
									<span class="format-icon format-{format}" aria-hidden="true"></span>
									{frame.label}
								</button>
							{/each}
						</div>
					</fieldset>

					<label class="control">
						<span>Kecerahan <output>{brightness}%</output></span>
						<input bind:value={brightness} type="range" min="75" max="125" step="5" />
					</label>

					<div class="settings-row">
						<label class="control">
							<span>Kamera</span>
							<select value={facingMode} onchange={changeCamera}>
								<option value="user">Depan</option>
								<option value="environment">Belakang</option>
							</select>
						</label>

						<label class="control">
							<span>Timer</span>
							<select bind:value={timerSeconds}>
								<option value={0}>Tanpa timer</option>
								<option value={3}>3 detik</option>
								<option value={5}>5 detik</option>
							</select>
						</label>
					</div>

					<label class="switch-control">
						<input bind:checked={mirrorPhoto} type="checkbox" />
						<span>Cerminkan foto</span>
					</label>

					<fieldset class="signature-settings">
						<legend>Tanda tangan</legend>
						<label class="control">
							<span>Nama atau pesan</span>
							<input
								bind:value={signature}
								type="text"
								maxlength="30"
								placeholder="contoh: with love, Ayam"
							/>
						</label>

						<div class="settings-row">
							<label class="control">
								<span>Posisi</span>
								<select bind:value={signaturePosition}>
									<option value="left">Kiri</option>
									<option value="center">Tengah</option>
									<option value="right">Kanan</option>
								</select>
							</label>

							<div class="control">
								<span>Warna</span>
								<div class="color-options">
									{#each Object.entries(signatureColors) as [color, value]}
										<button
											class:active={signatureColor === color}
											type="button"
											aria-label={`Warna tanda tangan ${color}`}
											aria-pressed={signatureColor === color}
											style:background={value}
											onclick={() => (signatureColor = color as SignatureColor)}
										></button>
									{/each}
								</div>
							</div>
						</div>
					</fieldset>

					<button class="reset-button" type="button" onclick={resetSettings}>Reset Pengaturan</button>
				</div>
			{/if}
		</aside>
	</div>

	<canvas bind:this={canvas} hidden></canvas>
</main>

<style>
	.photobox-page {
		width: min(100%, 86rem);
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

	.photobox-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 19rem;
		align-items: start;
		gap: 1.5rem;
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

	.camera-column.portrait {
		width: min(100%, 31rem);
		justify-self: center;
	}

	.camera-shell.portrait {
		aspect-ratio: 1080 / 1920;
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

	video.mirrored {
		transform: scaleX(-1);
	}

	.camera-frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.signature-preview {
		position: absolute;
		z-index: 2;
		bottom: 18%;
		max-width: 55%;
		overflow: hidden;
		margin: 0;
		font-family: var(--font-mea-culpa);
		font-size: clamp(1.35rem, 4.2vw, 3.4rem);
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-shadow: 0 3px 8px rgb(36 25 27 / 55%);
		pointer-events: none;
	}

	.signature-left {
		left: 12%;
	}

	.signature-center {
		left: 50%;
		transform: translateX(-50%);
	}

	.signature-right {
		right: 12%;
	}

	.countdown {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		margin: 0;
		background: rgb(36 25 27 / 28%);
		color: var(--color-cream);
		font-size: clamp(5rem, 16vw, 11rem);
		text-shadow: 0 5px 0 var(--color-tulip);
	}

	.camera-message {
		position: absolute;
		inset: 0;
		z-index: 3;
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

	.settings-panel {
		overflow: hidden;
		border: 2px solid rgb(200 73 90 / 32%);
		border-radius: 1.25rem;
		background: rgb(255 255 255 / 30%);
		box-shadow: 0 8px 0 rgb(200 73 90 / 12%);
	}

	.settings-toggle {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		border: 0;
		background: transparent;
		padding: 1rem 1.1rem;
		color: var(--color-tulip);
		font-size: 1.3rem;
		cursor: pointer;
	}

	.settings-content {
		display: grid;
		gap: 1.15rem;
		border-top: 1px solid rgb(200 73 90 / 20%);
		padding: 1.1rem;
	}

	fieldset {
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}

	legend,
	.control > span {
		display: flex;
		width: 100%;
		justify-content: space-between;
		margin-bottom: 0.45rem;
		color: var(--color-sage);
		font-size: 0.95rem;
	}

	.filter-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.format-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.format-options button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border: 1px solid rgb(200 73 90 / 24%);
		border-radius: 0.65rem;
		background: rgb(254 244 218 / 62%);
		padding: 0.6rem;
		color: var(--color-tulip);
		cursor: pointer;
	}

	.format-options button.active {
		border-color: var(--color-tulip);
		background: rgb(251 144 195 / 24%);
	}

	.format-icon {
		display: inline-block;
		border: 1px solid currentColor;
		border-radius: 0.15rem;
	}

	.format-landscape {
		width: 1.25rem;
		height: 0.75rem;
	}

	.format-portrait {
		width: 0.75rem;
		height: 1.25rem;
	}

	.filter-grid button {
		display: grid;
		grid-template-columns: 1.25rem 1fr;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgb(200 73 90 / 24%);
		border-radius: 0.65rem;
		background: rgb(254 244 218 / 62%);
		padding: 0.55rem;
		color: var(--color-tulip);
		text-align: left;
		cursor: pointer;
	}

	.filter-grid button.active {
		border-color: var(--color-tulip);
		background: rgb(251 144 195 / 24%);
	}

	.filter-swatch {
		width: 1.25rem;
		aspect-ratio: 1;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-blush), var(--color-sage));
	}

	.control {
		display: block;
		min-width: 0;
	}

	.control input[type='text'],
	.control select {
		width: 100%;
		min-height: 2.65rem;
		border: 1px solid rgb(200 73 90 / 35%);
		border-radius: 0.65rem;
		background: var(--color-cream);
		padding: 0.55rem 0.7rem;
		color: var(--color-tulip);
		font: inherit;
	}

	.control input[type='range'] {
		width: 100%;
		accent-color: var(--color-tulip);
	}

	.settings-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.switch-control {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--color-sage);
		cursor: pointer;
	}

	.switch-control input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--color-tulip);
	}

	.signature-settings {
		display: grid;
		gap: 0.85rem;
		border-top: 1px solid rgb(200 73 90 / 20%);
		padding-top: 1rem;
	}

	.color-options {
		display: flex;
		min-height: 2.65rem;
		align-items: center;
		gap: 0.55rem;
	}

	.color-options button {
		width: 1.65rem;
		height: 1.65rem;
		border: 2px solid rgb(75 41 47 / 22%);
		border-radius: 50%;
		cursor: pointer;
	}

	.color-options button.active {
		outline: 2px solid var(--color-tulip);
		outline-offset: 2px;
	}

	.reset-button {
		border: 0;
		background: transparent;
		padding: 0.35rem;
		color: var(--color-sage);
		text-decoration: underline;
		cursor: pointer;
	}

	@media (max-width: 900px) {
		.photobox-layout {
			grid-template-columns: 1fr;
		}

		.settings-panel:not(.settings-open) {
			box-shadow: none;
		}
	}

	@media (max-width: 640px) {
		header {
			display: block;
		}

		header div {
			margin-top: 1.5rem;
			text-align: left;
		}

		.camera-shell,
		.settings-panel {
			border-radius: 0.75rem;
		}

		.camera-actions {
			flex-direction: column;
		}
	}
</style>
