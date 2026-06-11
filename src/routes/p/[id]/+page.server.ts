import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBindings, type PhotoShare } from '$lib/server/photo-shares';

export const load: PageServerLoad = async ({ params, platform }) => {
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

	return {
		id: share.id,
		expiresAt: share.expires_at
	};
};
