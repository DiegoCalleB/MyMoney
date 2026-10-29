import { z } from "zod";
import { uuid } from "./common";

/** Clases en las que se puede repartir una cuenta (igual que `account_compositions.asset_class`). */
export const COMPOSITION_CLASSES = [
  "equity",
  "fixed_income",
  "cash",
  "real_estate",
  "crypto",
  "commodity",
] as const;
export type CompositionClass = (typeof COMPOSITION_CLASSES)[number];

/** Cuenta cuyo reparto se edita; los porcentajes viajan como campos `w_<clase>` y se leen aparte. */
export const setCompositionInput = z.object({ spaceId: uuid, accountId: uuid });
export type SetCompositionInput = z.infer<typeof setCompositionInput>;
