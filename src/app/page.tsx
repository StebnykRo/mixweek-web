import { redirect } from 'next/navigation';

/**
 * The bare domain has no content of its own — every page lives under a route
 * group. Without this, https://<host>/ answers 404, which reads as a broken
 * deployment to anyone who types the address without a path.
 *
 * /events is behind the app shell, which sends a signed-out visitor on to
 * /login. So this one redirect serves both cases.
 */
export default function RootPage(): never {
  redirect('/events');
}
