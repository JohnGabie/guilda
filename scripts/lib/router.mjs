// The router (D17, 4d, 4f): it only reads. It lists the pending messages of one address with their routes.
// It starts no process, writes no receipt and writes no message.
import fs from 'node:fs';
import { readBindings } from './queue.mjs';
import { busPaths, takeBusLock, releaseBusLock, readMailbox, pendingOf } from './bus.mjs';

export const ROUTE_RELAY = 'relay';
export const ROUTE_WAIT = 'wait';
export const ROUTE_NONE = 'none';

const BOUND = 'bound';
const CLAUDE = 'claude';
const DELIVER_LOCK = (address) => `${address}.deliver`;

/** The route of a binding: `relay` (the main session relays it), `wait` (it waits in the mailbox) or `none`. */
export function routeOf(binding) {
  if (!binding || binding.state !== BOUND) return ROUTE_NONE;
  if (binding.tool === CLAUDE && binding.inSession === true) return ROUTE_RELAY;
  if (binding.tool === 'codex' || (binding.tool === CLAUDE && binding.inSession === false)) return ROUTE_WAIT;
  return ROUTE_NONE;
}

/**
 * The pending messages of `address` in file order: [{ id, from, type, route, header }]. It runs under the delivery
 * lock `.guilda/bus/<address>.deliver.lock`, and a held lock gives BusError 3 'busy'. It creates no bus folder.
 */
export function deliverPlan(projectDir, address) {
  const bus = busPaths(projectDir).bus;
  try {
    if (!fs.lstatSync(bus).isDirectory()) return [];
  } catch {
    return [];
  }
  const held = takeBusLock(projectDir, DELIVER_LOCK(address));
  try {
    const route = routeOf(readBindings(projectDir)[address]);
    return pendingOf(readMailbox(projectDir, address)).map((m) => ({
      id: m.id,
      from: m.from,
      type: m.type,
      route,
      header: `guilda-message: ${m.id} from ${m.from} type ${m.type}`,
    }));
  } finally {
    releaseBusLock(held);
  }
}
