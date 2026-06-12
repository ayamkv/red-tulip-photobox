import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	MAX_PHOTO_BYTES,
	PHOTO_TTL_SECONDS,
	createShareId,
	enforceUploadLimit,
	getBindings,
	type PhotoShare,
	removeExpiredShares
} from '$lib/server/photo-shares';

export const GET: RequestHandler = async ({ platform, url }) => {
	const { DB, PHOTOS } = getBindings(platform);
	const now = Math.floor(Date.now() / 1000);
	const limitParam = Number(url.searchParams.get('limit') ?? 48);
	const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 48, 1), 96);

	const shares = await DB
		.prepare(
			`SELECT id, created_at, expires_at
			 FROM photo_shares
			 WHERE expires_at > ?
			 ORDER BY created_at DESC
			 LIMIT ?`
		)
		.bind(now, limit)
		.all<Pick<PhotoShare, 'id' | 'created_at' | 'expires_at'>>();

	platform?.ctx.waitUntil(removeExpiredShares(DB, PHOTOS));

	return json(
		{
			photos: shares.results.map((share) => ({
				id: share.id,
				createdAt: share.created_at,
				expiresAt: share.expires_at,
				shareUrl: new URL(`/p/${share.id}`, url.origin).toString(),
				fileUrl: new URL(`/p/${share.id}/file`, url.origin).toString()
			}))
		},
		{
			headers: {
				'cache-control': 'no-store'
			}
		}
	);
};

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const { DB, PHOTOS } = getBindings(platform);
	const contentType = request.headers.get('content-type')?.split(';')[0];

	if (contentType !== 'image/png') {
		return json({ message: 'Only PNG photos can be uploaded.' }, { status: 415 });
	}

	const declaredSize = Number(request.headers.get('content-length') ?? 0);
	if (declaredSize > MAX_PHOTO_BYTES) {
		return json({ message: 'The photo is too large.' }, { status: 413 });
	}

	await enforceUploadLimit(DB, request);

	const photo = await request.arrayBuffer();
	if (!photo.byteLength || photo.byteLength > MAX_PHOTO_BYTES) {
		return json({ message: 'The photo is empty or too large.' }, { status: 413 });
	}

	const id = createShareId();
	const objectKey = `photos/${id}.png`;
	const createdAt = Math.floor(Date.now() / 1000);
	const expiresAt = createdAt + PHOTO_TTL_SECONDS;

	await PHOTOS.put(objectKey, photo, {
		httpMetadata: {
			contentType: 'image/png',
			cacheControl: 'private, max-age=3600'
		},
		customMetadata: {
			shareId: id,
			expiresAt: String(expiresAt)
		}
	});

	try {
		await DB
			.prepare(
				`INSERT INTO photo_shares (id, object_key, created_at, expires_at)
				 VALUES (?, ?, ?, ?)`
			)
			.bind(id, objectKey, createdAt, expiresAt)
			.run();
	} catch (cause) {
		await PHOTOS.delete(objectKey);
		throw cause;
	}

	platform?.ctx.waitUntil(removeExpiredShares(DB, PHOTOS));

	return json(
		{
			id,
			shareUrl: new URL(`/p/${id}`, url.origin).toString(),
			fileUrl: new URL(`/p/${id}/file`, url.origin).toString(),
			createdAt,
			expiresAt
		},
		{ status: 201 }
	);
};
