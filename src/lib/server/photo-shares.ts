import { error } from '@sveltejs/kit';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export const PHOTO_TTL_SECONDS = 24 * 60 * 60;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_UPLOADS_PER_MINUTE = 5;

export type PhotoShare = {
	id: string;
	object_key: string;
	created_at: number;
	expires_at: number;
	download_count: number;
};

type CloudflareBindings = {
	DB: D1Database;
	PHOTOS: R2Bucket;
};

export function getBindings(platform: App.Platform | undefined) {
	const env = platform?.env as CloudflareBindings | undefined;

	if (!env?.DB || !env.PHOTOS) {
		error(503, 'Photo sharing is not configured yet.');
	}

	return env;
}

export function createShareId() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

export async function enforceUploadLimit(db: D1Database, request: Request) {
	const address = request.headers.get('cf-connecting-ip') ?? 'local';
	const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
	const clientHash = Array.from(new Uint8Array(hashBuffer), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	const minuteBucket = Math.floor(Date.now() / 60_000);

	const result = await db
		.prepare(
			`INSERT INTO upload_limits (client_hash, minute_bucket, upload_count)
			 VALUES (?, ?, 1)
			 ON CONFLICT (client_hash, minute_bucket)
			 DO UPDATE SET upload_count = upload_count + 1
			 RETURNING upload_count`
		)
		.bind(clientHash, minuteBucket)
		.first<{ upload_count: number }>();

	if ((result?.upload_count ?? 1) > MAX_UPLOADS_PER_MINUTE) {
		error(429, 'Too many uploads. Please wait a minute and try again.');
	}
}

export async function removeExpiredShares(db: D1Database, bucket: R2Bucket) {
	const now = Math.floor(Date.now() / 1000);
	const expired = await db
		.prepare('SELECT id, object_key FROM photo_shares WHERE expires_at <= ? LIMIT 25')
		.bind(now)
		.all<Pick<PhotoShare, 'id' | 'object_key'>>();

	if (expired.results.length) {
		await bucket.delete(expired.results.map((share) => share.object_key));
		await db
			.prepare(
				`DELETE FROM photo_shares
				 WHERE id IN (${expired.results.map(() => '?').join(', ')})`
			)
			.bind(...expired.results.map((share) => share.id))
			.run();
	}

	await db
		.prepare('DELETE FROM upload_limits WHERE minute_bucket < ?')
		.bind(Math.floor(Date.now() / 60_000) - 10)
		.run();
}
