import { z } from "zod";
import { currencyCode, name } from "./common";

export const createSpaceInput = z.object({
  name,
  baseCurrency: currencyCode.default("EUR"),
});
export type CreateSpaceInput = z.infer<typeof createSpaceInput>;
