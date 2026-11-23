import type { IceCandidate } from 'mediasoup/types';
import { isIpOfFamily } from './network';
import type { TResolvedVoiceIngress } from './voice-ingresses';

// RFC 5245 keeps ice-foundations inside the ice-char alphabet and 32 chars
const FOUNDATION_SUFFIX = '+i';

const toIngressFoundation = (foundation: string) =>
  `${foundation
    .replace(/[^a-zA-Z0-9+/]/g, '')
    .slice(0, 32 - FOUNDATION_SUFFIX.length)}${FOUNDATION_SUFFIX}`;

const rewriteCandidate = (
  candidate: IceCandidate,
  address: string,
  port: number
): IceCandidate => ({
  ...candidate,
  foundation: toIngressFoundation(candidate.foundation),
  ip: address,
  address,
  port
});

// strict by design: the rewritten list replaces the announced one, so a candidate that
// is not rewritten is dropped rather than leaking the home server's address
const applyVoiceIngressCandidates = (
  candidates: IceCandidate[],
  ingress: TResolvedVoiceIngress
): IceCandidate[] => {
  const rewritten: IceCandidate[] = [];

  for (const candidate of candidates) {
    if (isIpOfFamily(candidate.address, 'ipv4')) {
      rewritten.push(
        rewriteCandidate(candidate, ingress.address, ingress.port)
      );
    } else if (isIpOfFamily(candidate.address, 'ipv6') && ingress.addressV6) {
      rewritten.push(
        rewriteCandidate(candidate, ingress.addressV6, ingress.port)
      );
    }
  }

  return rewritten;
};

export { applyVoiceIngressCandidates };
