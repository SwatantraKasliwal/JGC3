/* A failed save has to be said out loud. Mutations that have no form of
   their own to show the error in hand it here (api/hooks.js), and the toast
   provider shows it — the server's own words where it gave them. */
const listeners = new Set();

export const onError = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const notifyError = (error) => listeners.forEach((fn) => fn(error));
