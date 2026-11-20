import { VideoCodec } from '@/types';
import type { TExternalStreamsMap } from '@sharkord/shared';
import { StreamKind } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import type {
  RtpCapabilities,
  RtpCodecCapability
} from 'mediasoup-client/types';
import {
  getOwnedExternalVolumeKeys,
  getPreferredScreenCodec,
  getUserScreenVolumeKey,
  isOwnProducerEvent,
  resolveVolume
} from '../helpers';

describe('isOwnProducerEvent', () => {
  test('should treat a producer with our own user id as ours', () => {
    expect(isOwnProducerEvent(1, 1, StreamKind.AUDIO)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.VIDEO)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.SCREEN)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.SCREEN_AUDIO)).toBe(true);
  });

  test('should treat another user as not ours', () => {
    expect(isOwnProducerEvent(2, 1, StreamKind.AUDIO)).toBe(false);
  });

  // the runtime hands out external stream ids from a counter starting at zero, so the
  // second stream in a channel is id 1, which is also the first user id. treating that as
  // our own producer drops the plugin's audio for exactly one unlucky listener
  test('should never treat an external stream as ours, even on an id collision', () => {
    expect(isOwnProducerEvent(1, 1, StreamKind.EXTERNAL_AUDIO)).toBe(false);
    expect(isOwnProducerEvent(1, 1, StreamKind.EXTERNAL_VIDEO)).toBe(false);
    expect(isOwnProducerEvent(0, 0, StreamKind.EXTERNAL_AUDIO)).toBe(false);
  });

  test('should treat nothing as ours before the own user id is known', () => {
    expect(isOwnProducerEvent(1, undefined, StreamKind.AUDIO)).toBe(false);
  });
});

const stream = (key: string, ownerUserId?: number) => ({
  title: key,
  key,
  pluginId: 'obs',
  ownerUserId,
  tracks: { audio: true, video: true }
});

const STREAMS: TExternalStreamsMap = {
  10: { 0: stream('mine', 1), 1: stream('theirs', 2), 2: stream('nobody') }
};

describe('external stream default volume', () => {
  test('should start the owner of a stream muted', () => {
    const owned = getOwnedExternalVolumeKeys(STREAMS, 1);

    expect(resolveVolume({}, 'external-obs-mine', owned)).toBe(0);
  });

  test('should play everyone else at full volume', () => {
    const owned = getOwnedExternalVolumeKeys(STREAMS, 1);

    expect(resolveVolume({}, 'external-obs-theirs', owned)).toBe(100);
    expect(resolveVolume({}, 'external-obs-nobody', owned)).toBe(100);
    expect(resolveVolume({}, 'user-2', owned)).toBe(100);
  });

  test('should let a volume the owner picked win over the muted default', () => {
    const owned = getOwnedExternalVolumeKeys(STREAMS, 1);

    expect(
      resolveVolume({ 'external-obs-mine': 40 }, 'external-obs-mine', owned)
    ).toBe(40);
  });

  test('should own nothing before the own user id is known', () => {
    expect(getOwnedExternalVolumeKeys(STREAMS, undefined).size).toBe(0);
  });
});

describe('screen share audio default volume', () => {
  const screenKey = getUserScreenVolumeKey(2);

  test('should play screen share audio at full volume by default', () => {
    expect(resolveVolume({}, screenKey, new Set())).toBe(100);
  });

  test('should start screen share audio muted when the setting is on', () => {
    expect(resolveVolume({}, screenKey, new Set(), true)).toBe(0);
  });

  test('should only mute screen share audio, never voices or external streams', () => {
    expect(resolveVolume({}, 'user-2', new Set(), true)).toBe(100);
    expect(resolveVolume({}, 'external-obs-theirs', new Set(), true)).toBe(100);
  });

  test('should let a volume the user picked win over the muted default', () => {
    expect(resolveVolume({ [screenKey]: 60 }, screenKey, new Set(), true)).toBe(
      60
    );
  });
});

describe('getPreferredScreenCodec', () => {
  let payloadType = 96;

  const codec = (
    mimeType: string,
    profileLevelId?: string
  ): RtpCodecCapability => {
    payloadType += 1;

    return {
      kind: 'video',
      mimeType,
      preferredPayloadType: payloadType,
      clockRate: 90000,
      parameters: profileLevelId
        ? { 'profile-level-id': profileLevelId }
        : undefined
    };
  };

  const capabilitiesWith = (codecs: RtpCodecCapability[]): RtpCapabilities => ({
    codecs
  });

  // the router offers constrained baseline (42e01f) before the other h264
  // profiles, but chrome's media foundation hardware encoders reject it and
  // fall back to the openh264 software encoder, so the lookup must not just
  // take the first h264 match
  test('should pick high over main and constrained baseline', () => {
    const preferred = getPreferredScreenCodec(
      capabilitiesWith([
        codec('video/H264', '42e01f'),
        codec('video/H264', '640032'),
        codec('video/H264', '4d0032')
      ]),
      VideoCodec.H264
    );

    expect(preferred?.parameters?.['profile-level-id']).toBe('640032');
  });

  test('should pick main when high is not offered', () => {
    const preferred = getPreferredScreenCodec(
      capabilitiesWith([
        codec('video/H264', '42e01f'),
        codec('video/H264', '4d0032')
      ]),
      VideoCodec.H264
    );

    expect(preferred?.parameters?.['profile-level-id']).toBe('4d0032');
  });

  test('should settle for constrained baseline when nothing else is offered', () => {
    const preferred = getPreferredScreenCodec(
      capabilitiesWith([codec('video/H264', '42e01f')]),
      VideoCodec.H264
    );

    expect(preferred?.parameters?.['profile-level-id']).toBe('42e01f');
  });

  test('should keep the first match for codecs without profiles', () => {
    const preferred = getPreferredScreenCodec(
      capabilitiesWith([codec('video/VP9'), codec('video/VP8')]),
      VideoCodec.VP8
    );

    expect(preferred?.mimeType).toBe('video/VP8');
  });

  test('should return nothing without capabilities or a matching codec', () => {
    expect(getPreferredScreenCodec(null, VideoCodec.H264)).toBeUndefined();
    expect(
      getPreferredScreenCodec(
        capabilitiesWith([codec('video/VP9')]),
        VideoCodec.H264
      )
    ).toBeUndefined();
  });
});
