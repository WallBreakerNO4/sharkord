import { z } from 'zod';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { protectedProcedure } from '../../utils/trpc';

// the input is optional as a whole, so a direct connection needs no argument at
// all and stays backward compatible with every existing client
const createProducerTransportRoute = protectedProcedure
  .input(
    z
      .object({
        ingressId: z.string().trim().min(1).max(64).optional()
      })
      .optional()
  )
  .mutation(async ({ ctx, input }) => {
    const { runtime } = await getCurrentVoiceRuntime(ctx);

    const params = await runtime.createProducerTransport(
      ctx.user.id,
      input?.ingressId
    );

    return params;
  });

export { createProducerTransportRoute };
