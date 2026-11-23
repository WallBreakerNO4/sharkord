import { afterEach, describe, expect, test } from 'bun:test';
import { parse, stringify } from 'ini';
import { defaultConfig, envOverridesMap, zConfig } from '../config';
import { applyEnvOverrides } from '../helpers/apply-env-overrides';
import { deepMerge } from '../utils/deep-merge';

// applyEnvOverrides deliberately does no validation of its own: it drops whatever the env var
// says into the config object. what stops a bad value reaching the running server is the
// zConfig.parse wrapped around it in config.ts, and that pairing is what these cover. the
// real envOverridesMap is used rather than a copy, so a renamed variable fails here too
const applyOverrides = () =>
  zConfig.parse(applyEnvOverrides(defaultConfig, envOverridesMap));

// the default is what almost every deployment runs, and widening it by one entry is how a
// forwarded header from a public client silently becomes trusted
describe('trustedProxies default', () => {
  test('should trust the addresses a reverse proxy reaches us from', () => {
    expect(defaultConfig.server.trustedProxies).toEqual([
      '127.0.0.1',
      '::1',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      'fc00::/7'
    ]);
  });

  test('should not trust a public address', () => {
    const publicRanges = ['0.0.0.0/0', '::/0'];

    for (const entry of defaultConfig.server.trustedProxies) {
      expect(publicRanges).not.toContain(entry);
    }
  });
});

// an empty host is what keeps every existing deployment listening on all interfaces
describe('host default', () => {
  test('should be empty so the server keeps listening on every interface', () => {
    expect(defaultConfig.server.host).toBe('');
  });
});

describe('backupDatabase default', () => {
  test('should be on, since it is the only thing that makes a bad migration recoverable', () => {
    expect(defaultConfig.server.backupDatabase).toBe(true);
  });
});

// config.ini is rewritten on every boot, so the parsed shape has to survive
// stringify -> parse -> validate unchanged, or the next boot loses the ingresses
describe('webRtc.ingresses', () => {
  // the exact sequence config.ts runs at boot: parse, merge over the defaults, validate
  const bootParse = (text: string) =>
    zConfig.parse(
      deepMerge(defaultConfig, parse(text) as Partial<typeof defaultConfig>)
    );

  const ingressIniText = (fields: {
    name?: string;
    address?: string;
    addressV6?: string;
    port?: string;
  }) => {
    const lines = ['[webRtc.ingresses.eu]'];

    if (fields.name !== undefined) lines.push(`name = ${fields.name}`);
    if (fields.address !== undefined) lines.push(`address = ${fields.address}`);
    if (fields.addressV6 !== undefined)
      lines.push(`addressV6 = ${fields.addressV6}`);
    if (fields.port !== undefined) lines.push(`port = ${fields.port}`);

    return lines.join('\n');
  };

  const INGRESS_FIELDS = {
    name: '欧洲 (CN2)',
    address: '1.2.3.4',
    addressV6: '',
    port: '40000'
  };

  test('defaults to no ingresses', () => {
    expect(zConfig.parse(defaultConfig).webRtc.ingresses).toEqual({});
  });

  test('parses a section per ingress and drops unset optionals', () => {
    const parsed = bootParse(ingressIniText(INGRESS_FIELDS));

    expect(parsed.webRtc.ingresses).toEqual({
      eu: { name: '欧洲 (CN2)', address: '1.2.3.4', port: 40000 }
    });
  });

  test('parses an ingress without a port as unset', () => {
    const parsed = bootParse(
      ingressIniText({ name: '欧洲 (CN2)', address: '1.2.3.4' })
    );

    expect(parsed.webRtc.ingresses).toEqual({
      eu: { name: '欧洲 (CN2)', address: '1.2.3.4' }
    });
  });

  test('survives the rewrite cycle with an ingress configured', () => {
    const first = bootParse(ingressIniText(INGRESS_FIELDS));

    const second = bootParse(stringify(first));

    expect(second).toEqual(first);
  });

  test('survives the rewrite cycle with no ingresses configured', () => {
    const first = bootParse(stringify(defaultConfig));

    const second = bootParse(stringify(first));

    expect(second.webRtc.ingresses).toEqual({});
    expect(second).toEqual(first);
  });

  test('rejects an id with characters outside the allowed set', () => {
    const text = ingressIniText(INGRESS_FIELDS).replace(
      'webRtc.ingresses.eu',
      'webRtc.ingresses.e u'
    );

    expect(() => bootParse(text)).toThrow();
  });

  test('rejects an id longer than 64 characters', () => {
    const id = 'a'.repeat(65);
    const text = ingressIniText(INGRESS_FIELDS).replace(
      'webRtc.ingresses.eu',
      `webRtc.ingresses.${id}`
    );

    expect(() => bootParse(text)).toThrow();
  });

  test('rejects an empty name', () => {
    expect(() =>
      bootParse(ingressIniText({ ...INGRESS_FIELDS, name: '' }))
    ).toThrow();
  });

  test('rejects an empty address', () => {
    expect(() =>
      bootParse(ingressIniText({ ...INGRESS_FIELDS, address: '' }))
    ).toThrow();
  });

  test('rejects a port outside the allowed range', () => {
    for (const port of ['0', '65536', 'not-a-port']) {
      expect(() =>
        bootParse(ingressIniText({ ...INGRESS_FIELDS, port }))
      ).toThrow();
    }
  });
});

describe('env overrides are validated', () => {
  const savedEnv: Record<string, string | undefined> = {};

  const setEnv = (key: string, value: string) => {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];

    process.env[key] = value;
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }

      delete savedEnv[key];
    }
  });

  test('should accept a valid override', () => {
    setEnv('SHARKORD_PORT', '8080');

    expect(applyOverrides().server.port).toBe(8080);
  });

  test('should reject a port that is not a number', () => {
    setEnv('SHARKORD_PORT', 'not-a-port');

    expect(applyOverrides).toThrow();
  });

  test('should set the listen host from the env', () => {
    setEnv('SHARKORD_HOST', '127.0.0.1');

    expect(applyOverrides().server.host).toBe('127.0.0.1');

    setEnv('SHARKORD_HOST', '::1');

    expect(applyOverrides().server.host).toBe('::1');
  });

  test('should turn the database backup off from the env', () => {
    setEnv('SHARKORD_BACKUP_DATABASE', 'false');

    expect(applyOverrides().server.backupDatabase).toBe(false);
  });

  test('should turn the rate limiters off from the env', () => {
    setEnv('SHARKORD_RATE_LIMITERS_ENABLED', 'false');

    expect(applyOverrides().server.rateLimitersEnabled).toBe(false);
  });

  test('should reject a port outside the allowed range', () => {
    setEnv('SHARKORD_PORT', '-1');

    expect(applyOverrides).toThrow();

    setEnv('SHARKORD_PORT', '0');

    expect(applyOverrides).toThrow();
  });

  test('should reject a fractional port', () => {
    setEnv('SHARKORD_PORT', '80.5');

    expect(applyOverrides).toThrow();
  });

  test('should reject a structurally wrong value', () => {
    // JSON.parse succeeds here, so the value reaches the schema as an object
    setEnv('SHARKORD_PORT', '{"nested":true}');

    expect(applyOverrides).toThrow();
  });

  test('should reject an invalid webRtc override', () => {
    setEnv('SHARKORD_WEBRTC_MAX_BITRATE', '0');

    expect(applyOverrides).toThrow();
  });

  test('should accept a voice ingress list from the env', () => {
    setEnv(
      'SHARKORD_WEBRTC_INGRESSES',
      JSON.stringify({
        eu: { name: '欧洲 (CN2)', address: '1.2.3.4', port: 40000 },
        us: { name: '美国 (CN2)', address: 'edge-us.example.com' }
      })
    );

    expect(applyOverrides().webRtc.ingresses).toEqual({
      eu: { name: '欧洲 (CN2)', address: '1.2.3.4', port: 40000 },
      us: { name: '美国 (CN2)', address: 'edge-us.example.com' }
    });
  });

  test('should reject a voice ingress with an empty name from the env', () => {
    setEnv(
      'SHARKORD_WEBRTC_INGRESSES',
      JSON.stringify({ eu: { name: '', address: '1.2.3.4' } })
    );

    expect(applyOverrides).toThrow();
  });

  test('should reject a voice ingress id with a space from the env', () => {
    setEnv(
      'SHARKORD_WEBRTC_INGRESSES',
      JSON.stringify({ 'e u': { name: '欧洲 (CN2)', address: '1.2.3.4' } })
    );

    expect(applyOverrides).toThrow();
  });

  test('should coerce a comma separated list into an array', () => {
    setEnv('SHARKORD_TRUSTED_PROXIES', '10.0.0.1,10.0.0.2');

    expect(applyOverrides().server.trustedProxies).toEqual([
      '10.0.0.1',
      '10.0.0.2'
    ]);
  });

  test('should reject a list whose entries are empty', () => {
    setEnv('SHARKORD_ALLOWED_ORIGINS', ',');

    expect(applyOverrides).toThrow();
  });

  test('should leave the config untouched when no variable is set', () => {
    expect(applyOverrides()).toEqual(zConfig.parse(defaultConfig));
  });

  test('should not mutate defaultConfig', () => {
    setEnv('SHARKORD_PORT', '8080');

    applyOverrides();

    expect(defaultConfig.server.port).toBe(4991);
  });
});
