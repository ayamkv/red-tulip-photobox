<script lang="ts">
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';

	type FilterId = 'natural' | 'warm' | 'mono' | 'dreamy';
	type SignaturePosition = 'left' | 'center' | 'right';
	type SignatureColor = 'cream' | 'pink' | 'dark';
	type FacingMode = 'user' | 'environment';
	type FrameFormat = 'landscape' | 'portrait' | 'multiCream' | 'multiPink';
	type PhotoSlot = { x: number; y: number; width: number; height: number };
	type FrameConfig = {
		label: string;
		url: string;
		width: number;
		height: number;
		kind: 'single' | 'multi';
		slots?: PhotoSlot[];
		hasSignaturePrefix?: boolean;
	};

	const multiShotWidth = 1080 - 70 * 2;
	const multiShotHeight = (multiShotWidth / 16) * 9;
	const multiSlots: PhotoSlot[] = [0, 1, 2].map((index) => ({
		x: 70,
		y: 60 + index * (multiShotHeight + 18),
		width: multiShotWidth,
		height: multiShotHeight
	}));

	const frames: Record<FrameFormat, FrameConfig> = {
		landscape: {
			label: 'Landscape',
			url: '/assets/camboxframe1.png',
			width: 1134,
			height: 660,
			kind: 'single'
		},
		portrait: {
			label: 'Portrait',
			url: '/assets/camboxframe1vertical.png',
			width: 1080,
			height: 1920,
			kind: 'single'
		},
		multiCream: {
			label: '3 Foto Cream',
			url: '/assets/multiVertical.png',
			width: 1080,
			height: 1920,
			kind: 'multi',
			slots: multiSlots,
			hasSignaturePrefix: true
		},
		multiPink: {
			label: '3 Foto Pink',
			url: '/assets/multiVertical1.png',
			width: 1080,
			height: 1920,
			kind: 'multi',
			slots: multiSlots,
			hasSignaturePrefix: true
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
	let multiVideoOne = $state<HTMLVideoElement>();
	let multiVideoTwo = $state<HTMLVideoElement>();
	let multiVideoThree = $state<HTMLVideoElement>();
	let canvas = $state<HTMLCanvasElement>();
	let stream: MediaStream | null = null;
	let demoCanvas: HTMLCanvasElement | null = null;
	let photoUrl = $state('');
	let shotUrls = $state<string[]>([]);
	let currentShotUrl = $state('');
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
	let isSharing = $state(false);
	let shareError = $state('');
	let shareUrl = $state('');
	let qrCodeUrl = $state('');
	let shareCopied = $state(false);

	let activeFilter = $derived(filters.find((filter) => filter.id === selectedFilter) ?? filters[0]);
	let activeFrame = $derived(frames[frameFormat]);
	let signatureText = $derived(
		signature.trim() ? `Berdasteran with ${signature.trim()}` : ''
	);
	let renderedSignatureText = $derived(
		activeFrame.hasSignaturePrefix ? signature.trim() : signatureText
	);
	let captureSlots = $derived(
		activeFrame.kind === 'multi'
			? (activeFrame.slots ?? [])
			: [{ x: 0, y: 0, width: activeFrame.width, height: activeFrame.height }]
	);
	let totalCaptureSteps = $derived(captureSlots.length);
	let currentSlotIndex = $derived(Math.min(shotUrls.length, totalCaptureSteps - 1));
	let hasStartedPhoto = $derived(Boolean(photoUrl || currentShotUrl || shotUrls.length));
	let previewFilter = $derived(
		`${activeFilter.css === 'none' ? '' : activeFilter.css} brightness(${brightness}%)`.trim()
	);

	function revokeUrl(url: string) {
		if (url.startsWith('blob:')) URL.revokeObjectURL(url);
	}

	function clearShareState() {
		shareError = '';
		shareUrl = '';
		qrCodeUrl = '';
		shareCopied = false;
	}

	function clearCapturedMedia() {
		revokeUrl(photoUrl);
		revokeUrl(currentShotUrl);
		shotUrls.forEach(revokeUrl);
		photoUrl = '';
		shotUrls = [];
		currentShotUrl = '';
		clearShareState();
	}

	function detachStreamVideo(videoElement: HTMLVideoElement | undefined) {
		if (!videoElement) return;
		videoElement.pause();
		videoElement.srcObject = null;
	}

	async function playStreamVideo(videoElement: HTMLVideoElement | undefined) {
		if (!stream || !videoElement) return;

		if (videoElement.srcObject !== stream) {
			videoElement.srcObject = stream;
		}

		await videoElement.play().catch(() => undefined);
	}

	async function syncPreviewVideos() {
		if (!stream) return;
		await Promise.all([
			playStreamVideo(video),
			playStreamVideo(multiVideoOne),
			playStreamVideo(multiVideoTwo),
			playStreamVideo(multiVideoThree)
		]);
	}

	function stopCamera() {
		stream?.getTracks().forEach((track) => track.stop());
		detachStreamVideo(video);
		detachStreamVideo(multiVideoOne);
		detachStreamVideo(multiVideoTwo);
		detachStreamVideo(multiVideoThree);
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
			await syncPreviewVideos();
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

	function selectFrame(format: FrameFormat) {
		if (hasStartedPhoto) return;
		frameFormat = format;
		requestAnimationFrame(() => void syncPreviewVideos());
	}

	function wait(milliseconds: number) {
		return new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	async function waitForVideoDimensions(videoElement: HTMLVideoElement) {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			if (videoElement.videoWidth && videoElement.videoHeight) return true;
			await wait(100);
		}

		return Boolean(videoElement.videoWidth && videoElement.videoHeight);
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

	function drawVideoFrame(context: CanvasRenderingContext2D, slot: PhotoSlot) {
		if (!video) return false;

		const sourceRatio = video.videoWidth / video.videoHeight;
		const targetRatio = slot.width / slot.height;
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
		context.translate(slot.x, slot.y);
		if (mirrorPhoto) {
			context.translate(slot.width, 0);
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
			slot.width,
			slot.height
		);
		context.restore();
		return true;
	}

	function canvasToBlob(
		canvasElement: HTMLCanvasElement,
		type = 'image/png',
		quality?: number
	) {
		return new Promise<Blob>((resolve, reject) => {
			canvasElement.toBlob(
				(blob) => {
					if (blob) resolve(blob);
					else reject(new Error('Image export unavailable'));
				},
				type,
				quality
			);
		});
	}

	async function captureSlot(slot: PhotoSlot) {
		const slotCanvas = document.createElement('canvas');
		slotCanvas.width = slot.width;
		slotCanvas.height = slot.height;
		const context = slotCanvas.getContext('2d');
		if (!context || !video) throw new Error('Canvas unavailable');

		try {
			const didDraw = drawVideoFrame(context, {
				x: 0,
				y: 0,
				width: slot.width,
				height: slot.height
			});
			if (!didDraw) throw new Error('Video unavailable');

			const blob = await canvasToBlob(slotCanvas, 'image/jpeg', 0.92);
			return URL.createObjectURL(blob);
		} finally {
			slotCanvas.width = 1;
			slotCanvas.height = 1;
		}
	}

	async function drawShot(
		context: CanvasRenderingContext2D,
		shotUrl: string,
		slot: PhotoSlot
	) {
		const shot = await loadImage(shotUrl);
		context.save();
		context.filter = previewFilter;
		context.drawImage(shot, slot.x, slot.y, slot.width, slot.height);
		context.restore();
	}

	function drawSignature(context: CanvasRenderingContext2D, width: number, height: number) {
		if (!renderedSignatureText) return;

		if (activeFrame.hasSignaturePrefix) {
			context.save();
			context.font = "58px 'Mea Culpa', cursive";
			context.textAlign = 'left';
			context.textBaseline = 'middle';
			context.fillStyle = signatureColors[signatureColor];
			context.shadowColor = 'rgb(36 25 27 / 55%)';
			context.shadowBlur = 8;
			context.shadowOffsetY = 3;
			context.fillText(renderedSignatureText, 224, height * 0.592, width * 0.36);
			context.restore();
			return;
		}

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
		context.fillText(renderedSignatureText, position.x, height * 0.76, width * 0.72);
		context.restore();
	}

	async function renderPhoto(shots = shotUrls) {
		if (!canvas || !shots.length) return;

		const canvasElement = canvas;
		const { width, height } = activeFrame;
		canvasElement.width = width;
		canvasElement.height = height;
		const context = canvasElement.getContext('2d');
		if (!context) throw new Error('Canvas unavailable');

		try {
			context.clearRect(0, 0, width, height);

			for (let index = 0; index < shots.length; index += 1) {
				await drawShot(context, shots[index], captureSlots[index]);
			}

			const frame = await loadImage(activeFrame.url);
			context.drawImage(frame, 0, 0, width, height);
			await document.fonts.load("58px 'Mea Culpa'");
			drawSignature(context, width, height);

			const blob = await canvasToBlob(canvasElement);
			const nextPhotoUrl = URL.createObjectURL(blob);
			revokeUrl(photoUrl);
			photoUrl = nextPhotoUrl;
			clearShareState();
		} finally {
			canvasElement.width = 1;
			canvasElement.height = 1;
		}
	}

	async function runCountdown() {
		for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
			countdown = remaining;
			await wait(1000);
		}
		countdown = 0;
	}

	async function takePhoto() {
		await syncPreviewVideos();
		const hasVideoDimensions = video ? await waitForVideoDimensions(video) : false;

		if (
			isCapturing ||
			!cameraReady ||
			!video ||
			!hasVideoDimensions
		) {
			cameraError = 'Kamera belum siap. Tunggu sebentar lalu coba lagi.';
			return;
		}

		isCapturing = true;
		cameraError = '';

		try {
			if (activeFrame.kind === 'multi') {
				await runCountdown();
				currentShotUrl = await captureSlot(captureSlots[currentSlotIndex]);
			} else {
				await runCountdown();
				const capturedShot = await captureSlot(captureSlots[0]);
				shotUrls = [capturedShot];
				await renderPhoto([capturedShot]);
				stopCamera();
			}
		} catch {
			cameraError = 'Foto gagal diproses. Muat ulang halaman lalu coba lagi.';
		} finally {
			countdown = 0;
			isCapturing = false;
		}
	}

	function retake() {
		clearCapturedMedia();
		requestAnimationFrame(() => void startCamera());
	}

	function retakeCurrentShot() {
		revokeUrl(currentShotUrl);
		currentShotUrl = '';
		requestAnimationFrame(() => void syncPreviewVideos());
	}

	async function continueMultiPhoto() {
		if (!currentShotUrl) return;

		const nextShots = [...shotUrls, currentShotUrl];
		shotUrls = nextShots;
		currentShotUrl = '';

		if (nextShots.length === totalCaptureSteps) {
			await renderPhoto(nextShots);
			stopCamera();
		} else {
			requestAnimationFrame(() => void syncPreviewVideos());
		}
	}

	async function updateFilter(filterId: FilterId) {
		selectedFilter = filterId;
		if (photoUrl) await renderPhoto();
	}

	async function updateBrightness() {
		if (photoUrl) await renderPhoto();
	}

	async function createPhotoShare() {
		if (!photoUrl || isSharing) return;

		isSharing = true;
		shareError = '';
		shareCopied = false;

		try {
			const photo = await fetch(photoUrl).then((response) => response.blob());
			const response = await fetch('/api/photos', {
				method: 'POST',
				headers: { 'content-type': 'image/png' },
				body: photo
			});
			const result = (await response.json()) as {
				message?: string;
				shareUrl?: string;
			};

			if (!response.ok || !result.shareUrl) {
				throw new Error(result.message ?? 'QR gagal dibuat.');
			}

			shareUrl = result.shareUrl;
			qrCodeUrl = await QRCode.toDataURL(shareUrl, {
				width: 320,
				margin: 2,
				color: {
					dark: '#c8495a',
					light: '#fef4da'
				}
			});
		} catch (cause) {
			shareError =
				cause instanceof Error && cause.message !== 'Failed to fetch'
					? cause.message
					: 'QR gagal dibuat. Coba lagi sebentar.';
		} finally {
			isSharing = false;
		}
	}

	async function copyShareLink() {
		if (!shareUrl) return;

		try {
			await navigator.clipboard.writeText(shareUrl);
			shareCopied = true;
		} catch {
			shareError = 'Link belum bisa disalin. Buka link lalu salin dari browser.';
		}
	}

	function resetSettings() {
		retake();
		selectedFilter = 'natural';
		brightness = 100;
		facingMode = 'user';
		mirrorPhoto = true;
		timerSeconds = 3;
		frameFormat = 'landscape';
		signature = '';
		signaturePosition = 'center';
		signatureColor = 'cream';
	}

	onMount(() => {
		startCamera();
		return () => {
			stopCamera();
			clearCapturedMedia();
		};
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
		<div
			class:portrait={frameFormat === 'portrait' || activeFrame.kind === 'multi'}
			class="camera-column"
		>
			<section
				class:portrait={frameFormat === 'portrait' || activeFrame.kind === 'multi'}
				class="camera-shell"
				aria-live="polite"
			>
				{#if photoUrl}
					<img class="photo-result" src={photoUrl} alt="Potret Red Tulip kamu" />
				{:else}
					<div class="camera-view">
						{#if activeFrame.kind === 'multi'}
							<div class="multi-preview-slots" aria-hidden="true">
								{#each captureSlots as slot, index}
									<div
										class="multi-preview-slot"
										class:active-slot={index === currentSlotIndex && !photoUrl}
										style:left={`${(slot.x / activeFrame.width) * 100}%`}
										style:top={`${(slot.y / activeFrame.height) * 100}%`}
										style:width={`${(slot.width / activeFrame.width) * 100}%`}
										style:height={`${(slot.height / activeFrame.height) * 100}%`}
									>
										{#if shotUrls[index] || (index === currentSlotIndex && currentShotUrl)}
											<img
												class="slot-photo"
												src={shotUrls[index] ?? currentShotUrl}
												alt=""
												style:filter={previewFilter}
											/>
										{:else if index === currentSlotIndex}
											{#if index === 0}
												<video
													bind:this={multiVideoOne}
													playsinline
													muted
													style:filter={previewFilter}
													class:mirrored={mirrorPhoto}
												></video>
											{:else if index === 1}
												<video
													bind:this={multiVideoTwo}
													playsinline
													muted
													style:filter={previewFilter}
													class:mirrored={mirrorPhoto}
												></video>
											{:else}
												<video
													bind:this={multiVideoThree}
													playsinline
													muted
													style:filter={previewFilter}
													class:mirrored={mirrorPhoto}
												></video>
											{/if}
										{/if}

										{#if isCapturing && index === currentSlotIndex && countdown > 0}
											<p
												class="slot-countdown"
												aria-label={`Foto ${currentSlotIndex + 1} diambil dalam ${countdown}`}
											>
												{countdown}
											</p>
										{/if}

										{#if index === currentSlotIndex && !currentShotUrl && !photoUrl}
											<p class="slot-step">Foto {currentSlotIndex + 1}/{totalCaptureSteps}</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						<video
							bind:this={video}
							playsinline
							muted
							aria-label="Pratinjau kamera"
							style:filter={activeFrame.kind === 'multi' ? '' : previewFilter}
							class:mirrored={activeFrame.kind !== 'multi' && mirrorPhoto}
							class:capture-source={activeFrame.kind === 'multi'}
						></video>

						<img class="camera-frame" src={activeFrame.url} alt="" aria-hidden="true" />

						{#if renderedSignatureText}
							<p
								class="signature-preview signature-{signaturePosition}"
								class:signature-built-in={activeFrame.hasSignaturePrefix}
								style:color={signatureColors[signatureColor]}
							>
								{renderedSignatureText}
							</p>
						{/if}

						{#if activeFrame.kind !== 'multi' && countdown > 0}
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
					<button
						class="secondary-button"
						type="button"
						onclick={createPhotoShare}
						disabled={isSharing}
					>
						{isSharing ? 'Membuat QR...' : shareUrl ? 'Buat Ulang QR' : 'Buat QR'}
					</button>
				{:else if activeFrame.kind === 'multi' && currentShotUrl}
					<button class="secondary-button" type="button" onclick={retakeCurrentShot}>
						Foto Ulang
					</button>
					<button class="primary-button" type="button" onclick={continueMultiPhoto}>
						{shotUrls.length + 1 === totalCaptureSteps ? 'Selesai' : 'Lanjut'}
					</button>
				{:else}
					<button
						class="primary-button"
						type="button"
						onclick={takePhoto}
						disabled={!cameraReady || isCapturing}
					>
						{#if isCapturing}
							{countdown > 0 ? `Siap... ${countdown}` : 'Memproses...'}
						{:else if totalCaptureSteps > 1}
							Ambil Foto {currentSlotIndex + 1}
						{:else}
							Ambil Foto
						{/if}
					</button>
				{/if}
			</div>

			{#if shareError}
				<p class="share-error" role="alert">{shareError}</p>
			{/if}

			{#if qrCodeUrl && shareUrl}
				<section class="share-card" aria-live="polite">
					<img src={qrCodeUrl} alt="QR code untuk mengunduh foto" />
					<div>
						<h2>scan buat unduh di HP</h2>
						<p>Link dan foto akan kedaluwarsa dalam 24 jam.</p>
						<div class="share-actions">
							<a class="secondary-button" href={shareUrl} target="_blank" rel="noreferrer">
								Buka Link
							</a>
							<button class="secondary-button" type="button" onclick={copyShareLink}>
								{shareCopied ? 'Link Disalin' : 'Salin Link'}
							</button>
						</div>
					</div>
				</section>
			{/if}
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
									onclick={() => updateFilter(filter.id)}
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
									disabled={hasStartedPhoto}
									onclick={() => selectFrame(format as FrameFormat)}
								>
									<span class="format-icon format-{format}" aria-hidden="true"></span>
									{frame.label}
								</button>
							{/each}
						</div>
					</fieldset>

					<label class="control">
						<span>Kecerahan <output>{brightness}%</output></span>
						<input
							bind:value={brightness}
							type="range"
							min="75"
							max="125"
							step="5"
							onchange={updateBrightness}
						/>
					</label>

					<div class="settings-row">
						<label class="control">
							<span>Kamera</span>
							<select value={facingMode} onchange={changeCamera} disabled={hasStartedPhoto}>
								<option value="user">Depan</option>
								<option value="environment">Belakang</option>
							</select>
						</label>

						<label class="control">
							<span>Timer</span>
							<select bind:value={timerSeconds} disabled={hasStartedPhoto}>
								<option value={0}>Tanpa timer</option>
								<option value={3}>3 detik</option>
								<option value={5}>5 detik</option>
							</select>
						</label>
					</div>

					<label class="switch-control" class:disabled={hasStartedPhoto}>
						<input bind:checked={mirrorPhoto} type="checkbox" disabled={hasStartedPhoto} />
						<span>Cerminkan foto</span>
					</label>

					<fieldset class="signature-settings">
						<legend>Tanda tangan</legend>
						<label class="control">
							<span>Teks setelah “Berdasteran with”</span>
							<input
								bind:value={signature}
								type="text"
								maxlength="30"
								placeholder="contoh: Ayam"
								onchange={() => renderPhoto()}
							/>
						</label>

						<div class="settings-row">
							<label class="control">
								<span>Posisi</span>
								<select bind:value={signaturePosition} onchange={() => renderPhoto()}>
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
											onclick={async () => {
												signatureColor = color as SignatureColor;
												if (photoUrl) await renderPhoto();
											}}
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

	video.capture-source {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.multi-preview-slots {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.multi-preview-slot {
		position: absolute;
		overflow: hidden;
		background: #24191b;
	}

	.multi-preview-slot.active-slot {
		outline: 3px solid rgb(253 114 182 / 72%);
		outline-offset: -3px;
	}

	.multi-preview-slot video,
	.slot-photo {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.slot-countdown {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		background: rgb(36 25 27 / 28%);
		color: var(--color-cream);
		font-size: clamp(3rem, 14vw, 7rem);
		text-shadow: 0 5px 0 var(--color-tulip);
	}

	.slot-step {
		position: absolute;
		right: 0.65rem;
		bottom: 0.65rem;
		margin: 0;
		border-radius: 999px;
		background: rgb(36 25 27 / 68%);
		padding: 0.35rem 0.65rem;
		color: var(--color-cream);
		font-size: clamp(0.7rem, 2vw, 0.95rem);
	}

	.camera-frame {
		position: absolute;
		inset: 0;
		z-index: 2;
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

	.signature-built-in {
		top: 58.1%;
		bottom: auto;
		left: 20.75%;
		max-width: 36%;
		transform: none;
		font-size: clamp(1.25rem, 4vw, 3.35rem);
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
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}

	.camera-actions :global(.primary-button) {
		margin-top: 0;
	}

	.share-error {
		margin: 1rem 0 0;
		color: #923441;
		text-align: center;
	}

	.share-card {
		display: grid;
		grid-template-columns: minmax(9rem, 12rem) 1fr;
		align-items: center;
		gap: 1.25rem;
		margin-top: 1.5rem;
		border: 2px solid rgb(200 73 90 / 24%);
		border-radius: 1.25rem;
		background: rgb(255 255 255 / 34%);
		padding: 1rem;
	}

	.share-card > img {
		display: block;
		width: 100%;
		border-radius: 0.75rem;
	}

	.share-card h2 {
		margin: 0;
		font-size: clamp(1.75rem, 5vw, 2.6rem);
		font-weight: 400;
		line-height: 1;
	}

	.share-card p {
		margin: 0.5rem 0 0;
		color: var(--color-sage);
	}

	.share-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1rem;
	}

	.share-actions :global(.secondary-button) {
		min-height: 2.75rem;
		padding: 0.55rem 1rem;
	}

	.settings-panel {
		overflow: hidden;
		border: 2px solid rgb(200 73 90 / 32%);
		border-radius: 1.25rem;
		background: rgb(255 255 255 / 30%);
		box-shadow: 0 8px 0 rgb(200 73 90 / 12%);
	}

	@media (max-width: 42rem) {
		.share-card {
			grid-template-columns: 1fr;
			justify-items: center;
			text-align: center;
		}

		.share-card > img {
			width: min(100%, 13rem);
		}

		.share-actions {
			justify-content: center;
		}
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

	.format-options button:disabled,
	.control select:disabled,
	.switch-control.disabled {
		opacity: 0.52;
		cursor: not-allowed;
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

	.format-multiCream,
	.format-multiPink {
		width: 0.75rem;
		height: 1.25rem;
		background: linear-gradient(
			to bottom,
			transparent 0 29%,
			currentColor 29% 31%,
			transparent 31% 64%,
			currentColor 64% 66%,
			transparent 66%
		);
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
