import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { NoOptionsError, createPlan } from '@/features/assistant/plan';
import { PLAN_SYSTEM } from '@/features/assistant/prompts';
import { PLAN_TOOL, parsePlanOptions } from '@/features/assistant/schema';
import { createLocalSearch, getHabitualFoods } from '@/features/assistant/server';
import { mealInput } from '@/features/diary/schemas';
import { getDayEntries } from '@/features/diary/server';
import { getCurrentProfile } from '@/features/profile/server';
import { getAiService } from '@/lib/ai/server';
import { authorize, errorResponse, responseForError } from '@/lib/ai/route-helpers';
import { NutritionInputError, computeTargets } from '@/lib/nutrition';
import { isValidDay } from '@/features/diary/dates';

const bodySchema = z.object({
  mode: z.enum(['meal', 'day']),
  meal: mealInput.default('dinner'),
  date: z
    .string()
    .refine((value) => isValidDay(value))
    .optional(),
});

/**
 * POST /api/ai/plan ({ mode: 'meal' | 'day', meal?, date? }) → `{ status, options, remaining }`.
 * El modelo propone alimentos y gramos; la nutrición se calcula con los valores de la base.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('invalid_request', 400);
  const day = body.data.date ?? auth.day;

  const current = await getCurrentProfile();
  if (!current?.profile) return errorResponse('invalid_request', 400);

  let targets;
  try {
    targets = computeTargets(current.profile, { today: day });
  } catch (error) {
    if (error instanceof NutritionInputError) return errorResponse('invalid_request', 400);
    throw error;
  }

  try {
    const entries = await getDayEntries(auth.userId, day);
    if (!entries) return errorResponse('internal', 500);
    const ai = getAiService();
    const result = await createPlan(
      { mode: body.data.mode, meal: body.data.meal },
      {
        targets,
        entries,
        habitual: await getHabitualFoods(auth.userId, day),
        search: await createLocalSearch(),
        ask: (text) =>
          ai.structured(
            auth.userId,
            auth.day,
            { text, system: PLAN_SYSTEM, tool: PLAN_TOOL, parse: parsePlanOptions },
            request.signal,
          ),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NoOptionsError) return errorResponse('no_options', 422);
    return responseForError(error, 'ai/plan');
  }
}
