
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
      palletLength: z.number().optional().describe('The length of the pallet in feet.'),
      rollsPerPallet: z.number().optional().describe('Number of TPO rolls per pallet.'),
      qtyPerPallet: z.number().optional().describe('Number of accessory units per pallet.'),
      boardsPerPallet: z.number().optional().describe('Number of ISO boards per pallet.'),
    })
  ).describe('List of items in the order.'),
});

export type PackingSuggestionsInput = z.infer<typeof PackingSuggestionsInputSchema>;

const PackingSuggestionsOutputSchema = z.object({
  truckType: z.enum(['LTL', 'Half Truck', 'Full Truck']).describe('Recommended truck type (LTL, Half Truck, or Full Truck)'),
  trucksNeeded: z.number().int().describe('Number of trucks needed (integer).'),
  packingNotes: z.string().describe('AI suggested packing configuration.'),
  linearFeet: z.number().describe('The total linear feet required for the packing plan.'),
});

export type PackingSuggestionsOutput = z.infer<typeof PackingSuggestionsOutputSchema>;

export async function providePackingSuggestions(input: PackingSuggestionsInput): Promise<PackingSuggestionsOutput> {
  return providePackingSuggestionsFlow(input);
}

const packingSuggestionsPrompt = ai.definePrompt({
  name: 'packingSuggestionsPrompt',
  input: {schema: PackingSuggestionsInputSchema},
  output: {schema: PackingSuggestionsOutputSchema},
  prompt: `You are an expert in packing and logistics for roofing materials, adept at optimizing space utilization within trucks. Your primary goal is to calculate the total linear feet required and provide a detailed packing plan.

  Given a list of items with their SKUs, quantities, and properties, your goal is to determine the most efficient way to pack these items.

  Consider the following constraints and rules:
  - Full truck length: 48 feet.
  - Half truck length: 24 feet.
  - LTL (Less Than Truckload) is for shipments taking less than 14 linear feet.
  - Truck width is 9 feet.
  - Standard pallet width is 4 feet. Pallet length varies. A truck can fit two 4-ft wide pallets side-by-side.
  - Maximum truck weight: 42,000 lbs.
  
  Packing Rules by Category:
  - **TPO Rolls**:
    - They are shipped on pallets. The number of rolls per pallet is provided ('rollsPerPallet').
    - The length of a TPO pallet is given in 'palletLength' (in feet).
    - **Crucially, different TPO sizes (lengths) cannot be stacked on top of each other in the same footprint.**
    - Pallets of the *same* TPO size can be stacked two high.
    - Since two pallets fit side-by-side (8ft total width in a 9ft truck), up to 4 pallets of the *same size* take up the space of one pallet length.
    - Linear feet for a TPO size: \`ceil(num_pallets_for_this_size / 4) * pallet_length\`.

  - **ISO Insulation**:
    - ISO boards are shipped on pallets. Boards per pallet is provided ('boardsPerPallet').
    - Pallet length is provided ('palletLength'). Width is always 4ft.
    - **ISO pallets can be stacked 2 high.**
    - **ISO pallets can be placed 2 wide.**
    - This means up to 4 pallets of the same length ISO can occupy the footprint of one pallet length.
    - Linear feet for an ISO length group: \`ceil(num_pallets_for_this_length / 4) * pallet_length\`.

  - **Accessories**:
    - Accessory items are consolidated onto pallets. The number of units per pallet is given by 'qtyPerPallet'.
    - Calculate the total number of accessory pallets needed. These can be stacked 2-high and placed 2-wide.
    - Linear feet for accessories: \`ceil(total_accessory_pallets / 4) * 4\`. (Assuming a 4ft pallet length for accessories).

  Calculation Steps:
  1. For each unique TPO SKU, calculate pallets needed and then linear feet grouped by palletLength.
  2. For each unique ISO SKU, calculate pallets needed (\`ceil(quantity / boardsPerPallet)\`) and then linear feet grouped by palletLength.
  3. Calculate linear feet for all accessories.
  4. Sum the linear feet for TPO, ISO, and accessories to get the total required linear feet.
  5. Provide detailed packing notes explaining the pallet calculations, space allocation (how many floor spots and stacks), and total linear feet.
  6. Based on the total linear feet, provide a *simple* truck recommendation. If total linear feet < 14, 'LTL', 1 truck. If < 24, 'Half Truck', 1 truck. If <= 48, 'Full Truck', 1 truck. Otherwise, 'Full Truck' and calculate trucks needed as \`ceil(totalLinearFeet / 48)\`.

  **Always recommend the smallest and most efficient truck type possible.**

  Items:
  {{#each items}}
  - SKU: {{this.sku}}, Qty: {{this.quantity}}, Category: {{this.category}}{{#if this.palletLength}}, Pallet Length: {{this.palletLength}} ft{{/if}}{{#if this.rollsPerPallet}}, Rolls/Pallet: {{this.rollsPerPallet}}{{/if}}{{#if this.qtyPerPallet}}, Qty/Pallet: {{this.qtyPerPallet}}{{/if}}{{#if this.boardsPerPallet}}, Boards/Pallet: {{this.boardsPerPallet}}{{/if}}, Weight: {{this.weightLbs}} lbs
  {{/each}}
  
  Output in JSON format. Ensure you include the total 'linearFeet' in the response.
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
