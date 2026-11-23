import { isIpOfFamily, lookupHostname, type THostnameLookup } from './network';

// raw shape of one webRtc.ingresses entry, as it comes out of the config validation
type TVoiceIngressConfig = {
  name: string;
  address: string;
  addressV6?: string;
  port?: number;
};

// what the ice candidate rewrite and the public ingress list work off, the id being
// the [webRtc.ingresses.<id>] section name and the port already defaulted
type TResolvedVoiceIngress = {
  id: string;
  name: string;
  address: string;
  addressV6?: string;
  port: number;
};

// like the announced addresses, a hostname resolves once at boot so the ingress is
// announced as a plain ip: browsers do not reliably resolve hostname candidates
const resolveIngressAddress = async (
  id: string,
  address: string,
  resolveHostname: THostnameLookup
): Promise<string | undefined> => {
  if (isIpOfFamily(address, 'ipv4')) return address;

  if (isIpOfFamily(address, 'ipv6')) {
    console.warn(
      `webRtc.ingresses.${id} "${address}" is not an IPv4 address, the ingress is skipped.`
    );

    return undefined;
  }

  const resolved = await resolveHostname(address, 4);

  if (!resolved) {
    console.warn(
      `Could not resolve webRtc.ingresses.${id} hostname "${address}" to an IPv4 address, the ingress is skipped.`
    );
  }

  return resolved;
};

// ipv6 is opt in per ingress: anything that does not give an ipv6 turns it off rather
// than guessing one, the ipv4 side of the node stays usable
const resolveIngressAddressV6 = async (
  id: string,
  address: string | undefined,
  resolveHostname: THostnameLookup
): Promise<string | undefined> => {
  if (!address) return undefined;

  if (isIpOfFamily(address, 'ipv6')) return address;

  if (isIpOfFamily(address, 'ipv4')) {
    console.warn(
      `webRtc.ingresses.${id} "${address}" is not an IPv6 address, IPv6 is disabled for the ingress.`
    );

    return undefined;
  }

  const resolved = await resolveHostname(address, 6);

  if (!resolved) {
    console.warn(
      `Could not resolve webRtc.ingresses.${id} hostname "${address}" to an IPv6 address, IPv6 is disabled for the ingress.`
    );
  }

  return resolved;
};

// one unreachable node is skipped with a warning, it must not take the server's
// voice down with it
const resolveVoiceIngresses = async (
  ingresses: Record<string, TVoiceIngressConfig>,
  defaultPort: number,
  resolveHostname: THostnameLookup = lookupHostname
): Promise<TResolvedVoiceIngress[]> => {
  const resolved: TResolvedVoiceIngress[] = [];

  for (const [id, ingress] of Object.entries(ingresses)) {
    const address = await resolveIngressAddress(
      id,
      ingress.address.trim(),
      resolveHostname
    );

    if (!address) continue;

    const addressV6 = await resolveIngressAddressV6(
      id,
      ingress.addressV6?.trim(),
      resolveHostname
    );

    const node: TResolvedVoiceIngress = {
      id,
      name: ingress.name,
      address,
      port: ingress.port ?? defaultPort
    };

    if (addressV6) node.addressV6 = addressV6;

    resolved.push(node);
  }

  return resolved;
};

let resolvedVoiceIngresses: TResolvedVoiceIngress[] = [];

// set once by config at boot, everything reads through the getters so tests override
// them with spyOn instead of replacing the module
const getResolvedVoiceIngresses = (): TResolvedVoiceIngress[] =>
  resolvedVoiceIngresses;

const getVoiceIngressById = (id: string): TResolvedVoiceIngress | undefined => {
  const ingresses = getResolvedVoiceIngresses();

  return ingresses.find(({ id: ingressId }) => ingressId === id);
};

const setResolvedVoiceIngresses = (ingresses: TResolvedVoiceIngress[]) => {
  resolvedVoiceIngresses = ingresses;
};

export {
  getResolvedVoiceIngresses,
  getVoiceIngressById,
  resolveVoiceIngresses,
  setResolvedVoiceIngresses
};
export type { TResolvedVoiceIngress };
