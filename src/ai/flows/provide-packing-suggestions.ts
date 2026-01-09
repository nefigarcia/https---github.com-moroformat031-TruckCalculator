'use server';

/**
 * @fileOverview This file defines a Genkit flow for providing packing suggestions for an order,
 * utilizing AI to recommend optimal packing configurations based on item characteristics.
 *
 * - providePackingSuggestions - A function that takes an order's items (SKU, quantity) and returns packing suggestions.
 * - PackingSuggestionsInput - The input type for the providePackingSuggestions function.
 * - PackingSuggestionsOutput - The return type for the providePackingSuggestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PackingSuggestionsInputSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().describe('Stock keeping unit identifier'),
      quantity: z.number().int().positive().describe('Quantity of items'),
    })
  ).describe('List of items in the order.'),
});

export type PackingSuggestionsInput = z.infer<typeof PackingSuggestionsInputSchema>;

const PackingSuggestionsOutputSchema = z.object({
  truckType: z.enum(['LTL', 'Half Truck', 'Full Truck']).describe('Recommended truck type (LTL, Half Truck, or Full Truck)'),
  trucksNeeded: z.number().int().positive().describe('Number of trucks needed, rounded up to the nearest whole number.'),
  packingNotes: z.string().describe('AI suggested packing configuration.'),
});

export type PackingSuggestionsOutput = z.infer<typeof PackingSuggestionsOutputSchema>;

export async function providePackingSuggestions(input: PackingSuggestionsInput): Promise<PackingSuggestionsOutput> {
  return providePackingSuggestionsFlow(input);
}

const packingSuggestionsPrompt = ai.definePrompt({
  name: 'packingSuggestionsPrompt',
  input: {schema: PackingSuggestionsInputSchema},
  output: {schema: PackingSuggestionsOutputSchema},
  prompt: `You are an expert in packing and logistics, adept at optimizing space utilization within trucks.

  Given a list of items with their SKUs and quantities, your goal is to determine the most efficient way to pack these items into trucks, minimizing the number of trucks required.
  Consider the following constraints:
  - Each truck can carry a maximum weight of 42,000 lbs.
  - Each truck has a cargo space of 48 feet.
  - Different items may have different stacking rules (some can be stacked, others cannot).
  - You do not have access to real time data for the items, but you can make reasonable assumptions about packing factors and weights based on your expertise.

  Based on the items provided, recommend a truck type (LTL, Half Truck, or Full Truck) and the number of trucks needed. LTL is less than 14 feet, Half Truck is 14-24 feet, and Full Truck is 48 feet.

  Also provide packing notes, including any considerations regarding stacking, weight distribution, and item placement.

  Items:
  {{#each items}}
  - SKU: {{this.sku}}, Quantity: {{this.quantity}}
  {{/each}}
  Output in JSON format.
  `, config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
  },
});

const providePackingSuggestionsFlow = ai.defineFlow(
  {
    name: 'providePackingSuggestionsFlow',
    inputSchema: PackingSuggestionsInputSchema,
    outputSchema: PackingSuggestionsOutputSchema,
  },
  async input => {
    const {output} = await packingSuggestionsPrompt(input);
    return output!;
  }
);

