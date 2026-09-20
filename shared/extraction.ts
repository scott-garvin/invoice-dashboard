import { z } from "zod";
export const exampleSource =
  "Work order: Northstar Studio\nProject: Autumn campaign\nBrand workshop: 2 sessions at $450.00 each.\nCampaign design: 1 package at $1,800.00 each.\nCurrency: USD.\nPayment terms: Net 30.\nNo tax specified.";
const field = z
  .object({
    value: z.string().max(180).nullable(),
    quote: z.string().max(500).nullable(),
  })
  .strict();
export const extractionSchema = z
  .object({
    client: field,
    title: field,
    currency: field,
    terms: field,
    items: z
      .array(
        z
          .object({ description: field, quantity: field, unitPrice: field })
          .strict(),
      )
      .max(30),
    warnings: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export function verifyExtraction(raw: unknown, source: string): Extraction {
  const result = extractionSchema.parse(raw);
  const fields = [
    result.client,
    result.title,
    result.currency,
    result.terms,
    ...result.items.flatMap((i) => [i.description, i.quantity, i.unitPrice]),
  ];
  for (const f of fields) {
    if (f.value !== null && (!f.quote || !source.includes(f.quote)))
      throw new Error(
        "The extraction contains an unverifiable source quote. Please review the source manually.",
      );
  }
  return result;
}
export function exampleExtraction(): Extraction {
  const f = (value: string, quote = value) => ({ value, quote });
  return {
    client: f("Northstar Studio"),
    title: f("Autumn campaign"),
    currency: f("USD"),
    terms: f("Net 30"),
    items: [
      {
        description: f("Brand workshop"),
        quantity: f("2", "2 sessions"),
        unitPrice: f("450.00", "$450.00"),
      },
      {
        description: f("Campaign design"),
        quantity: f("1", "1 package"),
        unitPrice: f("1800.00", "$1,800.00"),
      },
    ],
    warnings: ["Tax was not specified. Verify the tax rate before issuing."],
  };
}
