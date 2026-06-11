import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBindings, type PhotoShare } from '$lib/server/photo-shares';

export const GET: RequestHandler = async ({ params, platform, url }) => {
	const { DB, PHOTOS } = getBindings(platform);
	const share = await DB
		.prepare('SELECT * FROM photo_shares WHERE id = ?')
		.bind(params.id)
		.first<PhotoShare>();

	if (!share) error(404, 'Foto tidak ditemukan.');

	if (share.expires_at <= Math.floor(Date.now() / 1000)) {
		platform?.ctx.waitUntil(
			Promise.all([
				PHOTOS.delete(share.object_key),
				DB.prepare('DELETE FROM photo_shares WHERE id = ?').bind(params.id).run()
			])
		);
		error(410, 'Foto ini sudah kedaluwarsa.');
	}

	const object = await PHOTOS.get(share.object_key);
	if (!object) error(404, 'File foto tidak ditemukan.');

	platform?.ctx.waitUntil(
		DB.prepare(
			'UPDATE photo_shares SET download_count = download_count + 1 WHERE id = ?'
		)
			.bind(params.id)
			.run()
	);

	return new Response(await object.arrayBuffer(), {
		headers: {
			'content-type': 'image/png',
			'etag': object.httpEtag,
			'cache-control': 'private, max-age=3600',
			'content-disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="red-tulip-photobox.png"`,
			'x-content-type-options': 'nosniff'
		}
	});
};
