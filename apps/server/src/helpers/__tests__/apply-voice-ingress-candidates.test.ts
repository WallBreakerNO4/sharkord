import { describe, expect, test } from 'bun:test';
import type { IceCandidate } from 'mediasoup/types';
import { applyVoiceIngressCandidates } from '../apply-voice-ingress-candidates';
import type { TResolvedVoiceIngress } from '../voice-ingresses';

const PUBLIC_IP = '203.0.113.7';
const PUBLIC_IPV6 = '2001:db8::7';

const udpCandidate: IceCandidate = {
  foundation: 'udpcandidate',
  priority: 1076302079,
  ip: PUBLIC_IP,
  address: PUBLIC_IP,
  protocol: 'udp',
  port: 40000,
  type: 'host'
};

const tcpCandidate: IceCandidate = {
  ...udpCandidate,
  foundation: 'tcpcandidate',
  priority: 1076276479,
  protocol: 'tcp',
  tcpType: 'passive'
};

const udpCandidateV6: IceCandidate = {
  ...udpCandidate,
  foundation: 'udpcandidatev6',
  ip: PUBLIC_IPV6,
  address: PUBLIC_IPV6
};

// the port is deliberately not the candidates' own, so a rewrite that keeps it shows up
const INGRESS: TResolvedVoiceIngress = {
  id: 'eu',
  name: '欧洲 (CN2)',
  address: '198.51.100.10',
  addressV6: '2001:db8::10',
  port: 41000
};

const RFC_FOUNDATION = /^[a-zA-Z0-9+/]{1,32}$/;

describe('applyVoiceIngressCandidates', () => {
  test('rewrites the udp and tcp candidates to the ingress address and port', () => {
    const result = applyVoiceIngressCandidates(
      [udpCandidate, tcpCandidate],
      INGRESS
    );

    expect(result).toHaveLength(2);

    for (const candidate of result) {
      expect(candidate.ip).toBe(INGRESS.address);
      expect(candidate.address).toBe(INGRESS.address);
      expect(candidate.port).toBe(INGRESS.port);
    }
  });

  test('keeps the protocol, priority, type and tcp type of each candidate', () => {
    const result = applyVoiceIngressCandidates(
      [udpCandidate, tcpCandidate],
      INGRESS
    );

    expect(result).toEqual([
      expect.objectContaining({
        protocol: 'udp',
        priority: udpCandidate.priority,
        type: 'host'
      }),
      expect.objectContaining({
        protocol: 'tcp',
        priority: tcpCandidate.priority,
        type: 'host',
        tcpType: 'passive'
      })
    ]);
  });

  // the rewrite is strict: an address that survives it is the home server's, which is
  // exactly what an ingress exists to hide, ipv6 included
  test('never keeps the original public address', () => {
    const result = applyVoiceIngressCandidates(
      [udpCandidate, tcpCandidate, udpCandidateV6],
      { ...INGRESS, addressV6: undefined }
    );

    for (const candidate of result) {
      expect(candidate.address).toBe(INGRESS.address);
    }
  });

  test('rewrites ipv6 candidates through the ingress ipv6 when one is set', () => {
    const result = applyVoiceIngressCandidates(
      [udpCandidate, udpCandidateV6],
      INGRESS
    );

    const v6 = result.find(({ address }) => address === INGRESS.addressV6);

    expect(result).toHaveLength(2);
    expect(v6?.ip).toBe(INGRESS.addressV6);
    expect(v6?.port).toBe(INGRESS.port);
    expect(v6?.protocol).toBe('udp');
  });

  test('drops ipv6 candidates when the ingress has no ipv6', () => {
    const result = applyVoiceIngressCandidates([udpCandidate, udpCandidateV6], {
      ...INGRESS,
      addressV6: undefined
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.address).toBe(INGRESS.address);
  });

  // one foundation is one network path to ice, so a rewritten candidate sharing the
  // origin's would pair with the home server's address
  test('gives each rewritten candidate a legal foundation of its own', () => {
    const result = applyVoiceIngressCandidates(
      [udpCandidate, tcpCandidate],
      INGRESS
    );
    const foundations = result.map(({ foundation }) => foundation);

    for (const foundation of foundations) {
      expect(foundation).toMatch(RFC_FOUNDATION);
    }

    expect(foundations).not.toContain(udpCandidate.foundation);
    expect(foundations).not.toContain(tcpCandidate.foundation);
    expect(new Set(foundations).size).toBe(foundations.length);
  });

  test('returns nothing for an empty candidate list', () => {
    expect(applyVoiceIngressCandidates([], INGRESS)).toEqual([]);
  });

  test('returns nothing when only ipv6 candidates exist and the ingress is ipv4 only', () => {
    const result = applyVoiceIngressCandidates([udpCandidateV6], {
      ...INGRESS,
      addressV6: undefined
    });

    expect(result).toEqual([]);
  });
});
