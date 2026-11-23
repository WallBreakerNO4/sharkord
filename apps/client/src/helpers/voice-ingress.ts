import type { TVoiceIngressOption } from '@sharkord/shared';

type TVoiceIngressSelection = {
  effectiveIngressId: string | undefined;
  isStale: boolean;
};

// ingresses is undefined while the public settings have not loaded yet. in that
// state nothing can be proven stale, so the stored preference stays untouched
// instead of silently dropping the user's route choice on a slow page load
const resolveEffectiveVoiceIngress = (
  storedIngressId: string | undefined,
  ingresses: TVoiceIngressOption[] | undefined
): TVoiceIngressSelection => {
  if (!storedIngressId) {
    return {
      effectiveIngressId: undefined,
      isStale: false
    };
  }

  if (ingresses === undefined) {
    return {
      effectiveIngressId: storedIngressId,
      isStale: false
    };
  }

  const found = ingresses.some(({ id }) => id === storedIngressId);

  if (!found) {
    return {
      effectiveIngressId: undefined,
      isStale: true
    };
  }

  return {
    effectiveIngressId: storedIngressId,
    isStale: false
  };
};

export { resolveEffectiveVoiceIngress };
export type { TVoiceIngressSelection };
