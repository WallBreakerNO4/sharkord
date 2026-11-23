import { getErrorMessage } from '@sharkord/shared';
import fs from 'fs/promises';
import { parse, stringify } from 'ini';
import z from 'zod';
import { applyEnvOverrides } from './helpers/apply-env-overrides';
import { ensureServerDirs } from './helpers/ensure-server-dirs';
import {
  getPrivateIp,
  resolveAnnouncedAddress,
  resolveAnnouncedAddressV6,
  resolveInternalAnnouncedAddress
} from './helpers/network';
import { CONFIG_INI_PATH } from './helpers/paths';
import {
  resolveVoiceIngresses,
  setResolvedVoiceIngresses
} from './helpers/voice-ingresses';
import { deepMerge } from './utils/deep-merge';
import { IS_DEVELOPMENT, IS_TEST } from './utils/env';

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }

  return value;
};

// ini gives every value as a string, so an unset port or addressV6 arrives as "" and is
// normalized to undefined here. config.ini is rewritten on every boot, and ini writes a
// present undefined as the literal "undefined", which no longer parses: unset optionals
// are dropped from the object instead of staying in it as undefined
const zVoiceIngress = z
  .object({
    name: z.string().trim().min(1).max(64),
    address: z.string().trim().min(1),
    addressV6: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().trim().optional()
    ),
    port: z.preprocess(
      (value) =>
        value === '' || value === undefined || value === null
          ? undefined
          : value,
      z.coerce.number().int().min(1).max(65535).optional()
    )
  })
  .transform((ingress) => {
    const next: {
      name: string;
      address: string;
      addressV6?: string;
      port?: number;
    } = {
      name: ingress.name,
      address: ingress.address
    };

    if (ingress.addressV6 !== undefined) next.addressV6 = ingress.addressV6;
    if (ingress.port !== undefined) next.port = ingress.port;

    return next;
  });

const zConfig = z.object({
  server: z.object({
    host: z.string().trim(),
    port: z.coerce.number().int().positive(),
    debug: z.coerce.boolean(),
    autoupdate: z.coerce.boolean(),
    backupDatabase: z.coerce.boolean(),
    maxRequestBodyBytes: z.coerce.number().int().positive(),
    rateLimitersEnabled: z.coerce.boolean(),
    allowedOrigins: z
      .preprocess(
        (value) => {
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') return value.split(',');

          return [value];
        },
        z.array(z.string().trim().min(1))
      )
      .default(['*']),
    trustedProxies: z
      .preprocess(
        (value) => {
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') return value.split(',');

          return [value];
        },
        z.array(z.string().trim().min(1))
      )
      .default([])
  }),
  oidc: z.object({
    enabled: z.coerce.boolean(),
    issuer: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
    redirectUri: z.string(),
    disableLocalLogin: z.coerce.boolean()
  }),
  webRtc: z.object({
    port: z.coerce.number().int().positive(),
    announcedAddress: z.string(),
    announcedAddressV6: z.string(),
    internalAnnouncedAddress: z.string(),
    maxBitrate: z.coerce.number().int().positive(),
    ingresses: z
      .record(
        z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_-]{1,64}$/),
        zVoiceIngress
      )
      .default({})
  })
});

type TConfig = z.infer<typeof zConfig>;

const defaultConfig: TConfig = {
  server: {
    host: '',
    port: 4991,
    debug: IS_DEVELOPMENT,
    autoupdate: false,
    backupDatabase: true,
    maxRequestBodyBytes: 256 * 1024,
    rateLimitersEnabled: true,
    allowedOrigins: ['*'],
    trustedProxies: [
      '127.0.0.1',
      '::1',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      'fc00::/7'
    ]
  },
  oidc: {
    enabled: false,
    issuer: '',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    disableLocalLogin: false
  },
  webRtc: {
    port: 40000,
    announcedAddress: '',
    announcedAddressV6: '',
    internalAnnouncedAddress: '',
    maxBitrate: 30_000_000, // 30 Mbps
    ingresses: {}
  }
};

let config: TConfig = structuredClone(defaultConfig);

await ensureServerDirs();

const configExists = await fs.exists(CONFIG_INI_PATH);

if (!configExists) {
  // config does not exist, create it with the default config
  await fs.writeFile(CONFIG_INI_PATH, stringify(config));
} else {
  try {
    // config exists, we need to make sure it is up to date with the schema
    // to make this easy, we will read the existing config, merge it with the default config, and write it back to the file
    // this way we don't have to worry about migrating old config files when we add/remove config options
    const existingConfigText = await fs.readFile(CONFIG_INI_PATH, {
      encoding: 'utf-8'
    });

    const existingConfig = parse(existingConfigText) as Partial<TConfig>;
    const mergedConfig = deepMerge(config, existingConfig);

    config = zConfig.parse(mergedConfig);

    await fs.writeFile(CONFIG_INI_PATH, stringify(config));
  } catch (error) {
    // something went wrong, just log the error and overwrite the config file with the default config
    console.error(
      `Error reading or parsing config.ini. Overwriting with default config. Error: ${getErrorMessage(error)}`
    );

    await fs.writeFile(CONFIG_INI_PATH, stringify(config));
  }
}

const envOverridesMap: Record<string, string> = {
  'server.host': 'SHARKORD_HOST',
  'server.port': 'SHARKORD_PORT',
  'server.debug': 'SHARKORD_DEBUG',
  'server.autoupdate': 'SHARKORD_AUTOUPDATE',
  'server.backupDatabase': 'SHARKORD_BACKUP_DATABASE',
  'server.maxRequestBodyBytes': 'SHARKORD_MAX_REQUEST_BODY_BYTES',
  'server.allowedOrigins': 'SHARKORD_ALLOWED_ORIGINS',
  'server.trustedProxies': 'SHARKORD_TRUSTED_PROXIES',
  'oidc.enabled': 'SHARKORD_OIDC_ENABLED',
  'oidc.issuer': 'SHARKORD_OIDC_ISSUER',
  'oidc.clientId': 'SHARKORD_OIDC_CLIENT_ID',
  'oidc.clientSecret': 'SHARKORD_OIDC_CLIENT_SECRET',
  'oidc.redirectUri': 'SHARKORD_OIDC_REDIRECT_URI',
  'oidc.disableLocalLogin': 'SHARKORD_OIDC_DISABLE_LOCAL_LOGIN',
  'webRtc.port': 'SHARKORD_WEBRTC_PORT',
  'webRtc.announcedAddress': 'SHARKORD_WEBRTC_ANNOUNCED_ADDRESS',
  'webRtc.announcedAddressV6': 'SHARKORD_WEBRTC_ANNOUNCED_ADDRESS_V6',
  'webRtc.internalAnnouncedAddress':
    'SHARKORD_WEBRTC_INTERNAL_ANNOUNCED_ADDRESS',
  'webRtc.maxBitrate': 'SHARKORD_WEBRTC_MAX_BITRATE',
  'webRtc.ingresses': 'SHARKORD_WEBRTC_INGRESSES',
  'server.rateLimitersEnabled': 'SHARKORD_RATE_LIMITERS_ENABLED'
};

// validated again after the overrides, otherwise an env var could put a value
// in the config that does not match its type at all
config = zConfig.parse(applyEnvOverrides(config, envOverridesMap));
config = IS_TEST ? config : deepFreeze(config);

const SERVER_PRIVATE_IP = await getPrivateIp();

// the address mediasoup announces. an explicit ip is used as is, a hostname is
// resolved through dns, and only when neither works do we ask the third party providers
const SERVER_PUBLIC_IP = await resolveAnnouncedAddress(
  config.webRtc.announcedAddress
);

// announced on a separate ipv6 listener next to the ipv4 one, off unless configured
const SERVER_PUBLIC_IPV6 = await resolveAnnouncedAddressV6(
  config.webRtc.announcedAddressV6
);

// a second address announced next to the public one, for self hosted servers where
// lan clients cannot reach the public ip (no nat loopback, split dns)
const SERVER_INTERNAL_ANNOUNCED_IP = await resolveInternalAnnouncedAddress(
  config.webRtc.internalAnnouncedAddress
);

// edge ingresses resolve at boot like the announced addresses: one that does not
// resolve is skipped with a warning instead of taking the server down
setResolvedVoiceIngresses(
  await resolveVoiceIngresses(config.webRtc.ingresses, config.webRtc.port)
);

export {
  config,
  deepFreeze,
  defaultConfig,
  envOverridesMap,
  SERVER_INTERNAL_ANNOUNCED_IP,
  SERVER_PRIVATE_IP,
  SERVER_PUBLIC_IP,
  SERVER_PUBLIC_IPV6,
  zConfig
};
