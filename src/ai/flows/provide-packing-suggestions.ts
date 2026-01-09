
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
      description: z.string().optional(),
      category: z.enum(['TPO', 'Accessory', 'ISO']).optional(),
      weightLbs: z.number().optional(),
      lengthInches: z.number().optional(),
      widthInches: z.number().optional(),
      heightInches: z.number().optional(),
      rollsPerPallet: z.number().optional(),
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
  prompt: `You are an expert in packing and logistics for roofing materials, adept at optimizing space utilization within trucks.

  Given a list of items with their SKUs, quantities, and properties, your goal is to determine the most efficient way to pack these items into trucks.

  Consider the following constraints and rules:
  - Full truck length: 48 feet.
  - Half truck length: 24 feet.
  - LTL (Less Than Truckload) is for shipments taking less than 14 linear feet.
  - Truck width is 9 feet.
  - Standard pallet dimensions are 40" x 48" (3.33' x 4'). A truck can fit two 4' wide pallets side-by-side.
  - Maximum truck weight: 42,000 lbs.
  
  Packing Rules by Category:
  - **TPO Rolls**:
    - They are shipped on pallets. The number of rolls per pallet is provided.
    - The length of a TPO pallet is determined by the roll length (e.g., a 10-ft roll is on a pallet that takes 10ft of truck length).
    - **Crucially, different TPO sizes (lengths) cannot be stacked on top of each other in the same footprint.** A 5-ft pallet stack and a 10-ft pallet stack must occupy different floor spaces.
    - Pallets of the *same* TPO size can be stacked two high. For example, 32 rolls of 5-ft TPO (at 16 rolls/pallet = 2 pallets) can be stacked, but if the truck width allows, they can be placed side-by-side first. With a 9ft truck width, two 4ft-wide pallets fit side-by-side. So 4 pallets of 5-ft TPO (64 rolls) can occupy just 5 linear feet of the truck (2x2 stack).
  - **Accessories**:
    - 40 assorted accessory units are consolidated onto a single standard pallet (4'x3.33').
    - Calculate the total number of accessory pallets needed. These can be stacked or placed where space is available.
  - **ISO**:
    - ISO is not included in this calculation. Ignore any items with category 'ISO'.

  Calculation Steps:
  1.  Calculate total accessory pallets: Sum all accessory quantities and divide by 40, rounding up.
  2.  For each unique TPO SKU, calculate the number of pallets needed. (quantity / rollsPerPallet, rounded up).
  3.  Group the TPO pallets by their length. For each length group, calculate the total number of pallets.
  4.  For each TPO length group, determine the linear feet needed. Since pallets can be placed 2-wide and stacked 2-high, up to 4 pallets of the *same size* take up the space of one. Calculate the number of floor spots needed for each TPO size: \`ceil(num_pallets_for_this_size / 4)\`. The linear feet for this size is \`num_floor_spots * pallet_length_in_feet\`.
  5.  The total linear feet for TPO is the sum of the linear feet for each TPO size group.
  6.  The total linear feet for accessories is \`ceil(total_accessory_pallets / 4) * 4_feet\`. (Assuming a 4ft pallet length for accessories).
  7.  Sum the linear feet for TPO and accessories to get the total required linear feet.
  8.  Based on the total linear feet, recommend the truck type (LTL, Half Truck, or Full Truck) and the number of trucks needed.
  9.  Provide detailed packing notes explaining the pallet calculations, space allocation, and final recommendation.

  Items:
  {{#each items}}
  - SKU: {{this.sku}}, Qty: {{this.quantity}}, Category: {{this.category}}{{#if this.lengthInches}}, Length: {{this.lengthInches}} inches{{/if}}{{#if this.rollsPerPallet}}, Rolls/Pallet: {{this.rollsPerPallet}}{{/if}}
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
    const {output} = await providePackingSuggestionsPrompt(input);
    return output!;
  }
);
