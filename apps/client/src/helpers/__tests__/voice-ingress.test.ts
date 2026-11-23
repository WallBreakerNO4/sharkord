import type { TVoiceIngressOption } from '@sharkord/shared';
import { describe, expect, it } from 'bun:test';
import { resolveEffectiveVoiceIngress } from '../voice-ingress';

const INGRESSES: TVoiceIngressOption[] = [
  { id: 'eu-west', name: 'EU West' },
  { id: 'us-east', name: 'US East' }
];

describe('resolveEffectiveVoiceIngress', () => {
  it('keeps the stored ingress untouched while the public settings have not loaded', () => {
    const selection = resolveEffectiveVoiceIngress('eu-west', undefined);

    expect(selection).toEqual({
      effectiveIngressId: 'eu-west',
      isStale: false
    });
  });

  it('keeps a direct connection untouched while the public settings have not loaded', () => {
    const selection = resolveEffectiveVoiceIngress(undefined, undefined);

    expect(selection).toEqual({
      effectiveIngressId: undefined,
      isStale: false
    });
  });

  it('returns the stored ingress when it is still configured', () => {
    const selection = resolveEffectiveVoiceIngress('us-east', INGRESSES);

    expect(selection).toEqual({
      effectiveIngressId: 'us-east',
      isStale: false
    });
  });

  it('falls back to direct when the stored ingress is no longer configured', () => {
    const selection = resolveEffectiveVoiceIngress('gone-node', INGRESSES);

    expect(selection).toEqual({
      effectiveIngressId: undefined,
      isStale: true
    });
  });

  it('falls back to direct when the server loaded with no ingresses configured', () => {
    const selection = resolveEffectiveVoiceIngress('eu-west', []);

    expect(selection).toEqual({
      effectiveIngressId: undefined,
      isStale: true
    });
  });

  it('treats a direct connection as never stale', () => {
    const selection = resolveEffectiveVoiceIngress(undefined, INGRESSES);

    expect(selection).toEqual({
      effectiveIngressId: undefined,
      isStale: false
    });
  });

  it('matches the stored ingress by exact id', () => {
    const selection = resolveEffectiveVoiceIngress('EU-WEST', INGRESSES);

    expect(selection).toEqual({
      effectiveIngressId: undefined,
      isStale: true
    });
  });
});
