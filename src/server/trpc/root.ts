import { router, publicProcedure } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  // Health check / info
  health: publicProcedure.query(() => {
    return { status: 'ok', stack: 'T3 Stack (Next.js, TypeScript, tRPC, Prisma, Tailwind)' };
  }),
});

export type AppRouter = typeof appRouter;
