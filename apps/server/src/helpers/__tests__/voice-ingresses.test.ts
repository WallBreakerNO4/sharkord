import { describe, expect, spyOn, test } from 'bun:test';
import type { THostnameLookup } from '../network';
import { resolveVoiceIngresses } from '../voice-ingresses';

// a lookup stub keyed by "hostname:family", so no test ever touches dns
const lookupReturning = (
  results: Record<string, string | undefined>
): THostnameLookup => {
  return async (hostname, family) => results[`${hostname}:${family}`];
};

const EU = { name: '欧洲 (CN2)', address: '203.0.113.20' };

describe('resolveVoiceIngresses', () => {
  test('keeps a direct ipv4 and falls back to the default port', async () => {
    const resolved = await resolveVoiceIngresses({ eu: EU }, 40000);

    expect(resolved).toEqual([
      { id: 'eu', name: '欧洲 (CN2)', address: '203.0.113.20', port: 40000 }
    ]);
  });

  test('uses the port configured on the node', async () => {
    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, port: 41000 } },
      40000
    );

    expect(resolved[0]?.port).toBe(41000);
  });

  test('resolves a hostname to its ipv4 address', async () => {
    const resolveHostname = lookupReturning({
      'edge.example.com:4': '203.0.113.21'
    });

    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, address: 'edge.example.com' } },
      40000,
      resolveHostname
    );

    expect(resolved).toEqual([
      { id: 'eu', name: '欧洲 (CN2)', address: '203.0.113.21', port: 40000 }
    ]);
  });

  test('keeps a direct ipv6 in addressV6', async () => {
    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, addressV6: '2001:db8::20' } },
      40000
    );

    expect(resolved[0]?.addressV6).toBe('2001:db8::20');
  });

  test('resolves an addressV6 hostname to its ipv6', async () => {
    const resolveHostname = lookupReturning({
      'edge6.example.com:6': '2001:db8::21'
    });

    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, addressV6: 'edge6.example.com' } },
      40000,
      resolveHostname
    );

    expect(resolved[0]?.addressV6).toBe('2001:db8::21');
  });

  test('drops an addressV6 that does not resolve and keeps the node', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const resolveHostname = lookupReturning({});

    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, addressV6: 'edge6.example.com' } },
      40000,
      resolveHostname
    );

    expect(resolved).toEqual([
      { id: 'eu', name: '欧洲 (CN2)', address: '203.0.113.20', port: 40000 }
    ]);
    expect(warn).toHaveBeenCalled();
  });

  test('drops an empty addressV6 without a warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, addressV6: '' } },
      40000
    );

    expect(resolved[0]?.addressV6).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  // one unreachable node must not take the reachable ones down with it
  test('skips a node whose address does not resolve, with a warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const resolveHostname = lookupReturning({});

    const resolved = await resolveVoiceIngresses(
      {
        eu: { ...EU, address: 'edge.example.com' },
        us: { name: '美国 (CN2)', address: '203.0.113.22' }
      },
      40000,
      resolveHostname
    );

    expect(resolved).toEqual([
      { id: 'us', name: '美国 (CN2)', address: '203.0.113.22', port: 40000 }
    ]);
    expect(warn).toHaveBeenCalled();
  });

  test('skips a node whose address is an ipv6, with a warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = await resolveVoiceIngresses(
      { eu: { ...EU, address: '2001:db8::1' } },
      40000
    );

    expect(resolved).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  test('resolves no ingresses from an empty map', async () => {
    expect(await resolveVoiceIngresses({}, 40000)).toEqual([]);
  });
});
