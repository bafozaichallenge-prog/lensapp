import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Actor } from '@lens/services';
import { BREAK_GLASS_EMAIL, ServiceError } from '@lens/services';
import { auth } from '@/auth';
import { db } from './ctx';

export async function currentUser() {
  const s = await auth();
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
}

export async function requireActor() {
  const user = await currentUser();
  if (!user) redirect('/signin');
  const actor: Actor = { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL };
  return { user, actor };
}

/** Run a service call from a page: NOT_FOUND becomes a 404, FORBIDDEN a 403 page. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ServiceError) {
      if (e.code === 'NOT_FOUND') notFound();
      if (e.code === 'FORBIDDEN') redirect('/forbidden');
    }
    throw e;
  }
}

export const themeFromCookie = async () => (await cookies()).get('lens-theme')?.value === 'dark';
