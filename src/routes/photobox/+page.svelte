<script lang="ts">
	import gsap from 'gsap';
	import { getStroke } from 'perfect-freehand';
	import QRCode from 'qrcode';
	import { onMount, tick } from 'svelte';

	type FilterId = 'natural' | 'warm' | 'mono' | 'dreamy';
	type SignatureColor = 'cream' | 'pink' | 'dark';
	type FacingMode = 'user' | 'environment';
	type FrameFormat = 'landscape' | 'portrait' | 'multiCream' | 'multiPink';
	type PhotoSlot = { x: number; y: number; width: number; height: number };
	type SignaturePoint = [number, number, number];
	type SignaturePlacement = { x: number; y: number; width: number };
	type RecentPhoto = {
		id: string;
		createdAt: number;
		expiresAt: number;
		shareUrl: string;
		fileUrl: string;
	};
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
	const signaturePadWidth = 640;
	const signaturePadHeight = 240;
	const defaultSignaturePlacements: Record<FrameFormat, SignaturePlacement> = {
		landscape: { x: 50, y: 76, width: 36 },
		portrait: { x: 50, y: 76, width: 42 },
		multiCream: { x: 34, y: 59.2, width: 25 },
		multiPink: { x: 34, y: 59.2, width: 25 }
	};

	let video = $state<HTMLVideoElement>();
	let multiVideoOne = $state<HTMLVideoElement>();
	let multiVideoTwo = $state<HTMLVideoElement>();
	let multiVideoThree = $state<HTMLVideoElement>();
	let canvas = $state<HTMLCanvasElement>();
	let signaturePad = $state<HTMLCanvasElement>();
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
	let showSignatureModal = $state(false);
	let signatureStrokes = $state<SignaturePoint[][]>([]);
	let currentSignatureStroke = $state<SignaturePoint[]>([]);
	let signaturePath = $state('');
	let signaturePlacements = $state<Record<FrameFormat, SignaturePlacement>>({
		...defaultSignaturePlacements
	});
	let signatureColor = $state<SignatureColor>('cream');
	let isDrawingSignature = false;
	let isDraggingSignature = false;
	let pendingSignatureAction: 'capture' | null = null;
	let isSharing = $state(false);
	let shareError = $state('');
	let shareUrl = $state('');
	let qrCodeUrl = $state('');
	let shareCopied = $state(false);
	let recentPhotos = $state<RecentPhoto[]>([]);
	let recentPhotosError = $state('');
	let isLoadingRecentPhotos = $state(false);
	let showAllRecentPhotos = $state(false);
	let recentPhotosGrid = $state<HTMLElement>();
	let recentPhotosSection = $state<HTMLElement>();

	let activeFilter = $derived(filters.find((filter) => filter.id === selectedFilter) ?? filters[0]);
	let activeFrame = $derived(frames[frameFormat]);
	let activeSignaturePlacement = $derived(signaturePlacements[frameFormat]);
	let signatureImageUrl = $derived(
		signaturePath ? createSignatureSvg(signaturePath, signatureColors[signatureColor]) : ''
	);
	let signatureOverlayStyle = $derived(
		`left: ${activeSignaturePlacement.x}%; top: ${activeSignaturePlacement.y}%; width: ${activeSignaturePlacement.width}%;`
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
	let visibleRecentPhotos = $derived(
		showAllRecentPhotos ? recentPhotos : recentPhotos.slice(0, 6)
	);

	$effect(() => {
		const photoCount = visibleRecentPhotos.length;
		const expanded = showAllRecentPhotos;

		if (!photoCount || !recentPhotosGrid) return;

		void tick().then(() => animateRecentPhotos(expanded));
	});

	function revokeUrl(url: string) {
		if (url.startsWith('blob:')) URL.revokeObjectURL(url);
	}

	function clearShareState() {
		shareError = '';
		shareUrl = '';
		qrCodeUrl = '';
		shareCopied = false;
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function strokeToPath(stroke: number[][]) {
		if (!stroke.length) return '';

		const path = stroke.map(([x, y], index, points) => {
			const [nextX, nextY] = points[(index + 1) % points.length];
			const command = index === 0 ? 'M' : 'Q';
			return `${command} ${x.toFixed(2)} ${y.toFixed(2)} ${((x + nextX) / 2).toFixed(2)} ${((y + nextY) / 2).toFixed(2)}`;
		});

		return `${path.join(' ')} Z`;
	}

	function getSignaturePath(strokes: SignaturePoint[][]) {
		return strokes
			.map((stroke) =>
				strokeToPath(
					getStroke(stroke, {
						size: 16,
						thinning: 0.62,
						smoothing: 0.58,
						streamline: 0.5,
						simulatePressure: true
					})
				)
			)
			.filter(Boolean)
			.join(' ');
	}

	function createSignatureSvg(path: string, color: string) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${signaturePadWidth} ${signaturePadHeight}"><path d="${path}" fill="${color}"/></svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}

	function drawSignaturePath(context: CanvasRenderingContext2D, path: string, color: string) {
		context.clearRect(0, 0, signaturePadWidth, signaturePadHeight);
		context.fillStyle = color;

		if (!path) return;

		context.fill(new Path2D(path));
	}

	function redrawSignaturePad() {
		if (!signaturePad) return;

		const context = signaturePad.getContext('2d');
		if (!context) return;

		drawSignaturePath(
			context,
			getSignaturePath([...signatureStrokes, currentSignatureStroke]),
			'#4b292f'
		);
	}

	async function openSignatureModal(action: 'capture' | null = null) {
		pendingSignatureAction = action;
		showSignatureModal = true;
		await tick();
		redrawSignaturePad();
	}

	function closeSignatureModal() {
		showSignatureModal = false;
		pendingSignatureAction = null;
		isDrawingSignature = false;
		currentSignatureStroke = [];
	}

	function getSignaturePoint(event: PointerEvent): SignaturePoint {
		const target = event.currentTarget as HTMLCanvasElement;
		const rect = target.getBoundingClientRect();
		const pressure = event.pressure > 0 ? event.pressure : 0.5;

		return [
			((event.clientX - rect.left) / rect.width) * signaturePadWidth,
			((event.clientY - rect.top) / rect.height) * signaturePadHeight,
			pressure
		];
	}

	function startSignatureStroke(event: PointerEvent) {
		if (!signaturePad) return;

		event.preventDefault();
		signaturePad.setPointerCapture(event.pointerId);
		isDrawingSignature = true;
		currentSignatureStroke = [getSignaturePoint(event)];
		redrawSignaturePad();
	}

	function moveSignatureStroke(event: PointerEvent) {
		if (!isDrawingSignature) return;

		event.preventDefault();
		currentSignatureStroke = [...currentSignatureStroke, getSignaturePoint(event)];
		redrawSignaturePad();
	}

	function endSignatureStroke(event: PointerEvent) {
		if (!isDrawingSignature) return;

		event.preventDefault();
		isDrawingSignature = false;
		signatureStrokes = [...signatureStrokes, currentSignatureStroke];
		currentSignatureStroke = [];
		redrawSignaturePad();
	}

	function clearSignaturePad() {
		signatureStrokes = [];
		currentSignatureStroke = [];
		signaturePath = '';
		redrawSignaturePad();
	}

	async function saveSignature() {
		const nextPath = getSignaturePath(signatureStrokes);
		if (!nextPath) return;

		signaturePath = nextPath;
		showSignatureModal = false;
		clearShareState();

		if (photoUrl) await renderPhoto();

		if (pendingSignatureAction === 'capture') {
			pendingSignatureAction = null;
			await takePhoto();
		}
	}

	function updateSignaturePlacement(nextPlacement: Partial<SignaturePlacement>) {
		signaturePlacements = {
			...signaturePlacements,
			[frameFormat]: {
				...signaturePlacements[frameFormat],
				...nextPlacement
			}
		};
	}

	async function renderPhotoIfReady() {
		if (photoUrl) await renderPhoto();
	}

	function moveSignatureOverlay(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement;
		const parent = target.parentElement;
		if (!parent) return;

		const rect = parent.getBoundingClientRect();
		updateSignaturePlacement({
			x: clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92),
			y: clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 92)
		});
	}

	function startDraggingSignature(event: PointerEvent) {
		event.preventDefault();
		isDraggingSignature = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		moveSignatureOverlay(event);
	}

	function dragSignature(event: PointerEvent) {
		if (!isDraggingSignature) return;
		moveSignatureOverlay(event);
	}

	async function stopDraggingSignature() {
		if (!isDraggingSignature) return;

		isDraggingSignature = false;
		await renderPhotoIfReady();
	}

	function animateRecentPhotos(expanded = false) {
		if (!recentPhotosGrid) return;

		const cards = recentPhotosGrid.querySelectorAll('[data-recent-photo]');
		if (!cards.length) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			gsap.set(cards, { clearProps: 'all' });
			return;
		}

		gsap.fromTo(
			cards,
			{ autoAlpha: 0, y: expanded ? 22 : 14, scale: 0.96 },
			{
				autoAlpha: 1,
				y: 0,
				scale: 1,
				duration: 0.45,
				ease: 'power2.out',
				stagger: 0.045,
				overwrite: true
			}
		);
	}

	function addRecentPhoto(photo: RecentPhoto) {
		recentPhotos = [photo, ...recentPhotos.filter((item) => item.id !== photo.id)].slice(0, 96);
		recentPhotosError = '';
	}

	async function loadRecentPhotos() {
		isLoadingRecentPhotos = true;
		recentPhotosError = '';

		try {
			const response = await fetch('/api/photos?limit=96');
			const result = (await response.json()) as {
				message?: string;
				photos?: RecentPhoto[];
			};

			if (!response.ok || !result.photos) {
				throw new Error(result.message ?? 'Recent photos belum bisa dibuka.');
			}

			recentPhotos = result.photos;
		} catch (cause) {
			recentPhotosError =
				cause instanceof Error && cause.message !== 'Failed to fetch'
					? cause.message
					: 'Recent photos belum bisa dibuka.';
		} finally {
			isLoadingRecentPhotos = false;
		}
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

	async function drawSignature(context: CanvasRenderingContext2D, width: number, height: number) {
		if (!signatureImageUrl) return;

		const signatureImage = await loadImage(signatureImageUrl);
		const signatureWidth = width * (activeSignaturePlacement.width / 100);
		const signatureHeight = signatureWidth * (signaturePadHeight / signaturePadWidth);
		const signatureX = width * (activeSignaturePlacement.x / 100) - signatureWidth / 2;
		const signatureY = height * (activeSignaturePlacement.y / 100) - signatureHeight / 2;

		context.save();
		context.shadowColor = 'rgb(36 25 27 / 55%)';
		context.shadowBlur = 8;
		context.shadowOffsetY = 3;
		context.drawImage(signatureImage, signatureX, signatureY, signatureWidth, signatureHeight);
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
			await drawSignature(context, width, height);

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
				await publishCurrentPhoto();
			}
		} catch {
			cameraError = 'Foto gagal diproses. Muat ulang halaman lalu coba lagi.';
		} finally {
			countdown = 0;
			isCapturing = false;
		}
	}

	async function requestPhotoCapture() {
		if (!signaturePath) {
			await openSignatureModal('capture');
			return;
		}

		await takePhoto();
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
			await publishCurrentPhoto();
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

	async function uploadCurrentPhoto() {
		if (!photoUrl) return null;

		const photo = await fetch(photoUrl).then((response) => response.blob());
		const response = await fetch('/api/photos', {
			method: 'POST',
			headers: { 'content-type': 'image/png' },
			body: photo
		});
		const result = (await response.json()) as {
			message?: string;
			id?: string;
			createdAt?: number;
			expiresAt?: number;
			shareUrl?: string;
			fileUrl?: string;
		};

		if (!response.ok || !result.id || !result.shareUrl || !result.fileUrl || !result.expiresAt) {
			throw new Error(result.message ?? 'Foto gagal dipublish.');
		}

		const recentPhoto: RecentPhoto = {
			id: result.id,
			createdAt: result.createdAt ?? Math.floor(Date.now() / 1000),
			expiresAt: result.expiresAt,
			shareUrl: result.shareUrl,
			fileUrl: result.fileUrl
		};

		shareUrl = recentPhoto.shareUrl;
		addRecentPhoto(recentPhoto);
		return recentPhoto;
	}

	async function publishCurrentPhoto({ surfaceError = false } = {}) {
		if (!photoUrl || isSharing || shareUrl) return;

		isSharing = true;
		shareCopied = false;

		try {
			await uploadCurrentPhoto();
		} catch (cause) {
			const message =
				cause instanceof Error && cause.message !== 'Failed to fetch'
					? cause.message
					: 'Foto gagal dipublish. Coba lagi sebentar.';
			if (surfaceError) shareError = message;
			else recentPhotosError = message;
		} finally {
			isSharing = false;
		}
	}

	async function createPhotoShare() {
		if (!photoUrl || isSharing) return;

		isSharing = true;
		shareError = '';
		shareCopied = false;

		try {
			if (!shareUrl) {
				await uploadCurrentPhoto();
			}

			if (!shareUrl) {
				throw new Error('QR gagal dibuat.');
			}

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
		signatureStrokes = [];
		currentSignatureStroke = [];
		signaturePath = '';
		signaturePlacements = { ...defaultSignaturePlacements };
		signatureColor = 'cream';
	}

	onMount(() => {
		startCamera();
		void loadRecentPhotos();

		if (
			recentPhotosSection &&
			!window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			gsap.fromTo(
				recentPhotosSection,
				{ autoAlpha: 0, y: 18 },
				{ autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 }
			);
		}

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

						{#if signatureImageUrl}
							<button
								class="signature-preview"
								style={signatureOverlayStyle}
								type="button"
								aria-label="Geser tanda tangan"
								onpointerdown={startDraggingSignature}
								onpointermove={dragSignature}
								onpointerup={stopDraggingSignature}
								onpointercancel={stopDraggingSignature}
							>
								<img src={signatureImageUrl} alt="" />
							</button>
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
						onclick={requestPhotoCapture}
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

			<section bind:this={recentPhotosSection} class="recent-photos" aria-live="polite">
				<div class="recent-photos-heading">
					<div>
						<p>recent photos</p>
						<h2>foto yang baru masuk</h2>
					</div>

					{#if recentPhotos.length > 6}
						<button
							class="secondary-button recent-toggle"
							type="button"
							aria-expanded={showAllRecentPhotos}
							onclick={() => (showAllRecentPhotos = !showAllRecentPhotos)}
						>
							{showAllRecentPhotos ? 'Tutup Grid' : 'Lihat Semua'}
						</button>
					{/if}
				</div>

				{#if isLoadingRecentPhotos}
					<p class="recent-empty">loading recent photos...</p>
				{:else if recentPhotosError}
					<p class="recent-empty" role="alert">{recentPhotosError}</p>
				{:else if recentPhotos.length}
					<div
						bind:this={recentPhotosGrid}
						class:expanded={showAllRecentPhotos}
						class="recent-photo-grid"
					>
						{#each visibleRecentPhotos as photo (photo.id)}
							<a
								data-recent-photo
								class="recent-photo-card"
								href={photo.shareUrl}
								target="_blank"
								rel="noreferrer"
								aria-label="Buka foto terbaru Red Tulip Photobox"
							>
								<img src={photo.fileUrl} alt="Foto terbaru Red Tulip Photobox" loading="lazy" />
							</a>
						{/each}
					</div>
				{:else}
					<p class="recent-empty">belum ada foto publik. ambil satu dulu.</p>
				{/if}
			</section>
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
						<div class="signature-control-card">
							<p>
								Tanda tangan setelah “Berdasteran with” digambar manual biar masuk ke final image.
							</p>
							<button class="secondary-button" type="button" onclick={() => openSignatureModal()}>
								{signaturePath ? 'Ubah Tanda Tangan' : 'Buat Tanda Tangan'}
							</button>
						</div>

						<div class="settings-row">
							<label class="control">
								<span>X <output>{Math.round(activeSignaturePlacement.x)}%</output></span>
								<input
									value={activeSignaturePlacement.x}
									type="range"
									min="8"
									max="92"
									step="1"
									oninput={(event) =>
										updateSignaturePlacement({
											x: Number((event.currentTarget as HTMLInputElement).value)
										})}
									onchange={renderPhotoIfReady}
								/>
							</label>

							<label class="control">
								<span>Y <output>{Math.round(activeSignaturePlacement.y)}%</output></span>
								<input
									value={activeSignaturePlacement.y}
									type="range"
									min="8"
									max="92"
									step="1"
									oninput={(event) =>
										updateSignaturePlacement({
											y: Number((event.currentTarget as HTMLInputElement).value)
										})}
									onchange={renderPhotoIfReady}
								/>
							</label>
						</div>

						<label class="control">
							<span>Ukuran <output>{Math.round(activeSignaturePlacement.width)}%</output></span>
							<input
								value={activeSignaturePlacement.width}
								type="range"
								min="14"
								max="58"
								step="1"
								oninput={(event) =>
									updateSignaturePlacement({
										width: Number((event.currentTarget as HTMLInputElement).value)
									})}
								onchange={renderPhotoIfReady}
							/>
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
											await renderPhotoIfReady();
										}}
									></button>
								{/each}
							</div>
						</div>
					</fieldset>

					<button class="reset-button" type="button" onclick={resetSettings}>Reset Pengaturan</button>
				</div>
			{/if}
		</aside>
	</div>

	<canvas bind:this={canvas} hidden></canvas>

	{#if showSignatureModal}
		<div class="signature-modal-backdrop" role="presentation">
			<div class="signature-modal" role="dialog" aria-modal="true" aria-labelledby="signature-title">
				<div class="signature-modal-heading">
					<div>
						<p>Tanda tangan</p>
						<h2 id="signature-title">Tulis signature kamu</h2>
					</div>
					<button type="button" aria-label="Tutup modal tanda tangan" onclick={closeSignatureModal}>
						×
					</button>
				</div>

				<canvas
					bind:this={signaturePad}
					class="signature-pad"
					width={signaturePadWidth}
					height={signaturePadHeight}
					aria-label="Area menggambar tanda tangan"
					onpointerdown={startSignatureStroke}
					onpointermove={moveSignatureStroke}
					onpointerup={endSignatureStroke}
					onpointercancel={endSignatureStroke}
				></canvas>

				<p class="signature-modal-help">
					Gambar pakai mouse, trackpad, atau jari. Nanti bisa digeser langsung di atas photobox.
				</p>

				<div class="signature-modal-actions">
					<button class="secondary-button" type="button" onclick={clearSignaturePad}>Ulangi</button>
					<button class="secondary-button" type="button" onclick={closeSignatureModal}>Batal</button>
					<button class="primary-button" type="button" disabled={!signatureStrokes.length} onclick={saveSignature}>
						Pakai Tanda Tangan
					</button>
				</div>
			</div>
		</div>
	{/if}
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
		z-index: 3;
		border: 0;
		background: transparent;
		padding: 0;
		filter: drop-shadow(0 3px 8px rgb(36 25 27 / 55%));
		cursor: grab;
		touch-action: none;
		transform: translate(-50%, -50%);
	}

	.signature-preview:active {
		cursor: grabbing;
	}

	.signature-preview img {
		display: block;
		width: 100%;
		pointer-events: none;
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

	.recent-photos {
		margin-top: 1.5rem;
		border: 2px solid rgb(200 73 90 / 24%);
		border-radius: 1.25rem;
		background: rgb(255 255 255 / 30%);
		padding: clamp(1rem, 3vw, 1.35rem);
		box-shadow: 0 8px 0 rgb(200 73 90 / 10%);
	}

	.recent-photos-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.recent-photos-heading p {
		margin: 0;
		color: var(--color-sage);
		font-size: 1rem;
	}

	.recent-photos-heading h2 {
		margin: 0.2rem 0 0;
		font-size: clamp(1.9rem, 5vw, 3rem);
		font-weight: 400;
		line-height: 1;
	}

	.recent-toggle {
		min-height: 2.65rem;
		padding: 0.5rem 1rem;
		white-space: nowrap;
	}

	.recent-photo-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.recent-photo-grid.expanded {
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
	}

	.recent-photo-card {
		position: relative;
		display: block;
		overflow: hidden;
		aspect-ratio: 1;
		border: 2px solid rgb(200 73 90 / 22%);
		border-radius: 0.9rem;
		background: #24191b;
		box-shadow: 0 5px 0 rgb(200 73 90 / 12%);
		transform-origin: center;
	}

	.recent-photo-card img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 180ms ease;
	}

	.recent-photo-card:hover img,
	.recent-photo-card:focus-visible img {
		transform: scale(1.04);
	}

	.recent-empty {
		margin: 0;
		border-radius: 0.9rem;
		background: rgb(254 244 218 / 58%);
		padding: 1rem;
		color: var(--color-sage);
		text-align: center;
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

		.recent-photos-heading {
			display: block;
		}

		.recent-toggle {
			width: 100%;
			margin-top: 0.85rem;
		}

		.recent-photo-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
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

	.signature-control-card {
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgb(200 73 90 / 20%);
		border-radius: 0.9rem;
		background: rgb(254 244 218 / 48%);
		padding: 0.85rem;
	}

	.signature-control-card p {
		margin: 0;
		color: var(--color-sage);
		font-size: 0.95rem;
		line-height: 1.35;
	}

	.signature-control-card :global(.secondary-button) {
		min-height: 2.65rem;
		padding: 0.55rem 1rem;
	}

	.signature-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		background: rgb(36 25 27 / 62%);
		padding: 1rem;
	}

	.signature-modal {
		width: min(100%, 44rem);
		border: 2px solid rgb(200 73 90 / 30%);
		border-radius: 1.35rem;
		background: var(--color-cream);
		padding: clamp(1rem, 3vw, 1.35rem);
		box-shadow: 0 16px 0 rgb(36 25 27 / 20%);
	}

	.signature-modal-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.signature-modal-heading p,
	.signature-modal-help {
		margin: 0;
		color: var(--color-sage);
	}

	.signature-modal-heading h2 {
		margin: 0.15rem 0 0;
		font-size: clamp(2rem, 6vw, 3.4rem);
		font-weight: 400;
		line-height: 0.95;
	}

	.signature-modal-heading button {
		border: 0;
		background: transparent;
		color: var(--color-tulip);
		font-size: 2rem;
		line-height: 1;
		cursor: pointer;
	}

	.signature-pad {
		display: block;
		width: 100%;
		aspect-ratio: 640 / 240;
		border: 2px dashed rgb(200 73 90 / 34%);
		border-radius: 1rem;
		background:
			linear-gradient(rgb(254 244 218 / 88%), rgb(254 244 218 / 88%)),
			linear-gradient(135deg, rgb(251 144 195 / 20%), rgb(123 180 134 / 20%));
		touch-action: none;
		cursor: crosshair;
	}

	.signature-modal-help {
		margin-top: 0.75rem;
		font-size: 0.95rem;
		line-height: 1.35;
	}

	.signature-modal-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.65rem;
		margin-top: 1rem;
	}

	.signature-modal-actions :global(.primary-button),
	.signature-modal-actions :global(.secondary-button) {
		min-height: 2.75rem;
		margin-top: 0;
		padding: 0.55rem 1rem;
	}

	.signature-modal-actions :global(.primary-button:disabled) {
		opacity: 0.55;
		cursor: not-allowed;
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
