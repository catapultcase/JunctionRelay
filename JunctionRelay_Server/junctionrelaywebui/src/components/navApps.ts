/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * The apps the navbar switches between, in one table.
 *
 * Adding an app is one row here - not the same union and ternary repeated in
 * Navbar, Navbar_Desktop and Navbar_Mobile, where a miss shows up only as a tab
 * that navigates nowhere.
 */

export type AppId = 'server' | 'homelab' | 'models' | 'docs' | 'cloud';

/** Switcher order, left to right. */
export const APP_IDS: readonly AppId[] = ['server', 'homelab', 'models', 'docs', 'cloud'] as const;

/** Landing route per app. 'server' is the root, so it is the fallback. */
export const APP_HOME: Record<AppId, string> = {
    server: '/',
    homelab: '/homelab',
    models: '/models',
    docs: '/docs',
    cloud: 'https://cloud.junctionrelay.com/',
};

/*
 * Apps that live somewhere else entirely.
 *
 * ⛔ AN EXTERNAL APP IS NOT A ROUTE. Cloud was a nav TAB inside SERVER, which
 * meant it could only be reached from one app and read as a page of this
 * server rather than a different product. It is a peer of
 * the others in the switcher now - reachable from every app - but it must
 * never be handed to navigate(), which would try to route to it internally,
 * and it owns no local path so appForPath must never return it.
 */
export const APP_EXTERNAL: Partial<Record<AppId, string>> = {
    cloud: 'https://cloud.junctionrelay.com/',
};

/*
 * One emoji per app, shown in the switcher. The Cloud dashboard already reads this way
 * and it makes the list scannable at a glance rather than four similar words.
 */
export const APP_EMOJI: Record<AppId, string> = {
    server: '🛰️',
    homelab: '🏠',
    models: '🧠',
    docs: '📖',
    cloud: '☁️',
};

export const APP_LABEL: Record<AppId, string> = {
    server: 'SERVER',
    homelab: 'HOMELAB',
    models: 'MODELS',
    docs: 'DOCUMENTATION',
    cloud: 'CLOUD',
};

/*
 * Collapse to the drawer BELOW this width, per app.
 *
 * One global breakpoint cannot serve apps with different tab counts: server
 * carries ten or more items and needs the drawer early, while models carries
 * four and stays readable far narrower.
 */
export const NAV_COLLAPSE_PX: Record<AppId, number> = {
    server: 1500,          // 1600 until Cloud left the tab row - one item fewer
    homelab: 1200,
    models: 1100,
    docs: 1000,           // one tab row item - the site's own nav does the rest
    cloud: 1100,           // never rendered: an external app has no tab row
};

/** The app that owns a path. Falls back to 'server', which owns the root. */
export const appForPath = (pathname: string): AppId =>
    APP_IDS.find(id => id !== 'server' && !APP_EXTERNAL[id] &&
        (pathname === APP_HOME[id] || pathname.startsWith(APP_HOME[id] + '/'))) ?? 'server';
