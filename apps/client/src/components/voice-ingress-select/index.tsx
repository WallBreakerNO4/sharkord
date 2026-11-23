import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { setVoiceIngressId } from '@/features/app/actions';
import { useVoiceIngressId } from '@/features/app/hooks';
import { useVoiceIngresses } from '@/features/server/hooks';
import { resolveEffectiveVoiceIngress } from '@/helpers/voice-ingress';
import {
  Group,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@sharkord/ui';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// radix select needs a non-empty value for every item; '@' is outside the
// server's ingress id charset so this sentinel can never collide with a node id
const DIRECT_VALUE = '@direct';

// the compact variant fits the small stats popover in the sidebar
type TVoiceIngressSelectProps = {
  compact?: boolean;
};

const VoiceIngressSelect = memo(
  ({ compact = false }: TVoiceIngressSelectProps) => {
    const { t } = useTranslation('settings');
    const ingresses = useVoiceIngresses();
    const storedIngressId = useVoiceIngressId();

    const selection = useMemo(
      () => resolveEffectiveVoiceIngress(storedIngressId, ingresses),
      [storedIngressId, ingresses]
    );

    const selectedValue = selection.effectiveIngressId ?? DIRECT_VALUE;

    const handleValueChange = useCallback((value: string) => {
      const nextIngressId = value === DIRECT_VALUE ? undefined : value;
      const voiceControlsBridge = getVoiceControlsBridge();

      // no live voice session owner around: persist and let the next join
      // pick the route up
      if (!voiceControlsBridge) {
        setVoiceIngressId(nextIngressId);
        return;
      }

      voiceControlsBridge.reconnectVoice(nextIngressId);
    }, []);

    // zero configured routes means the whole control stays hidden, so a server
    // without ingresses looks exactly like before the feature existed
    if (ingresses.length === 0) return null;

    const select = (
      <Select value={selectedValue} onValueChange={handleValueChange}>
        <SelectTrigger className={compact ? 'h-7 w-full text-xs' : 'w-92'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={DIRECT_VALUE}>
              {t('voiceRouteDirect')}
            </SelectItem>
            {ingresses.map((ingress) => (
              <SelectItem key={ingress.id} value={ingress.id}>
                {ingress.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    if (compact) {
      return (
        <div className="mb-3 border-t border-border/50 pt-2">
          <h4 className="mb-1 font-medium text-orange-400">
            {t('voiceRouteLabel')}
          </h4>
          {select}
        </div>
      );
    }

    return (
      <Group label={t('voiceRouteLabel')} description={t('voiceRouteDesc')}>
        {select}
      </Group>
    );
  }
);

VoiceIngressSelect.displayName = 'VoiceIngressSelect';

export { VoiceIngressSelect };
