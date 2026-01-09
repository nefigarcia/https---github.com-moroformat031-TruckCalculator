'use server';

import { providePackingSuggestions, type PackingSuggestionsInput, type PackingSuggestionsOutput } from '@/ai/flows/provide-packing-suggestions';
import { z } from 'zod';

const itemsSchema = z.array(
    z.object({
      sku: z.string(),
      quantity: z.number(),
    })
);

export async function getTruckSuggestion(items: PackingSuggestionsInput['items']): Promise<PackingSuggestionsOutput> {
  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) {
      throw new Error("Invalid items provided.");
  }
  
  try {
    const result = await providePackingSuggestions({ items: parsedItems.data });
    return result;
  } catch (error) {
    console.error('Error getting truck suggestion:', error);
    throw new Error('An error occurred while calculating the truck requirements. Please try again.');
  }
}
