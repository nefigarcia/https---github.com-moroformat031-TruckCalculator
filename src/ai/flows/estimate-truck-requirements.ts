'use server';

/**
 * @fileOverview Estimates the truck requirements for a given set of SKUs and quantities, utilizing AI when weight and dimensions are unavailable.
 *
 * - estimateTruckRequirements - A function that estimates the truck requirements.
 * - EstimateTruckRequirementsInput - The input type for the estimateTruckRequirements function.
 * - EstimateTruckRequirementsOutput - The return type for the estimateTruckRequirements function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EstimateTruckRequirementsInputSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().describe('The stock keeping unit (SKU) of the item.'),
      quantity: z.number().int().positive().describe('The quantity of the item.'),
      weightLbs: z.number().optional().describe('The weight of a single item in pounds.'),
      lengthInches: z.number().optional().describe('The length of a single item in inches.'),
      widthInches: z.number().optional().describe('The width of a single item in inches.'),
      heightInches: z.number().optional().describe('The height of a single item in inches.'),
    })
  ).describe('An array of items to be shipped.'),
});

export type EstimateTruckRequirementsInput = z.infer<typeof EstimateTruckRequirementsInputSchema>;

const TruckRecommendationSchema = z.object({
    truckType: z.enum(['LTL', 'Half Truck', 'Full Truck']).describe('The recommended truck type (LTL, Half Truck, or Full Truck).'),
    numberOfTrucks: z.number().int().positive().describe('The estimated number of trucks needed.'),
    reasoning: z.string().describe('The reasoning behind the truck recommendation.')
});

const EstimateTruckRequirementsOutputSchema = z.object({
  truckRecommendation: TruckRecommendationSchema.describe('The recommendation for the truck requirements.')
});

export type EstimateTruckRequirementsOutput = z.infer<typeof EstimateTruckRequirementsOutputSchema>;

export async function estimateTruckRequirements(input: EstimateTruckRequirementsInput): Promise<EstimateTruckRequirementsOutput> {
  return estimateTruckRequirementsFlow(input);
}

const estimateTruckRequirementsPrompt = ai.definePrompt({
  name: 'estimateTruckRequirementsPrompt',
  input: {schema: EstimateTruckRequirementsInputSchema},
  output: {schema: EstimateTruckRequirementsOutputSchema},
  prompt: `You are a logistics expert specializing in truckload optimization. Analyze the following order details and determine the optimal truck configuration.

Consider these constraints:
*   Maximum truck weight: 42,000 lbs
*   Full truck length: 48 ft
*   Half truck length: 24 ft
*   LTL (Less than Truckload): <14 ft

Items:
{{#each items}}
*   SKU: {{sku}}, Quantity: {{quantity}}
    {{#if weightLbs}}
    , Weight: {{weightLbs}} lbs
    {{/if}}
    {{#if lengthInches}}
    , Dimensions: {{lengthInches}}x{{widthInches}}x{{heightInches}} inches
    {{/if}}
{{/each}}


{{#each items}}
  {{#unless weightLbs}}
  For SKU {{sku}}, weight is unavailable, estimate the weight based on the item description and typical product characteristics.
  {{/unless}}
  {{#unless lengthInches}}
  For SKU {{sku}}, dimensions are unavailable, estimate the dimensions based on the item description and typical product characteristics.
  {{/unless}}
{{/each}}

Based on the items' properties, their quantities, and the truck constraints, determine the truck type and number of trucks required.

Return the output in JSON format.
`,
});

const estimateTruckRequirementsFlow = ai.defineFlow(
  {
    name: 'estimateTruckRequirementsFlow',
    inputSchema: EstimateTruckRequirementsInputSchema,
    outputSchema: EstimateTruckRequirementsOutputSchema,
  },
  async input => {
    const {output} = await estimateTruckRequirementsPrompt(input);
    return output!;
  }
);
