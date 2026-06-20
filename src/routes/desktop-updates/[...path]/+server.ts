import { head } from '@vercel/blob';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

const UPDATE_PREFIX = 'desktop-updates';

export const GET: RequestHandler = async ({ params }) => {
  const requestedPath = params.path;
  if (!requestedPath || requestedPath.includes('..')) {
    throw error(400, 'Invalid update path');
  }

  let blob: Awaited<ReturnType<typeof head>>;
  try {
    blob = await head(`${UPDATE_PREFIX}/${requestedPath}`);
  } catch {
    throw error(404, 'Update artifact not found');
  }

  throw redirect(302, blob.url);
};
