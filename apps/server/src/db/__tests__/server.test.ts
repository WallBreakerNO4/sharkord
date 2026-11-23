import { describe, expect, spyOn, test } from 'bun:test';
import * as voiceIngresses from '../../helpers/voice-ingresses';
import { getPublicSettings } from '../queries/server';

describe('getPublicSettings', () => {
  // the resolved list carries the backend address and port, but the client only ever
  // needs to display the node, so those must not leave the server
  test('should expose only the display fields of the voice ingresses', async () => {
    spyOn(voiceIngresses, 'getResolvedVoiceIngresses').mockReturnValue([
      {
        id: 'eu',
        name: '欧洲 (CN2)',
        address: '198.51.100.10',
        addressV6: '2001:db8::10',
        port: 40000
      }
    ]);

    const settings = await getPublicSettings();

    expect(settings.voiceIngresses).toEqual([{ id: 'eu', name: '欧洲 (CN2)' }]);
  });

  test('should expose no voice ingresses when none are resolved', async () => {
    spyOn(voiceIngresses, 'getResolvedVoiceIngresses').mockReturnValue([]);

    const settings = await getPublicSettings();

    expect(settings.voiceIngresses).toEqual([]);
  });
});
