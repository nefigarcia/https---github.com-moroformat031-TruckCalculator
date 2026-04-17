'use server';

import { estimateTruckRequirements, type EstimateTruckRequirementsInput } from '@/ai/flows/estimate-truck-requirements';
import { providePackingSuggestions, type PackingSuggestionsInput, type PackingSuggestionsOutput } from '@/ai/flows/provide-packing-suggestions';
import { skuData } from '@/lib/sku-data';
import type { Item, ItemWithData, EstimateTruckRequirementsOutput, TruckSuggestion, AiUsage } from '@/lib/types';
import { getAiUsage as readAiUsage, incrementAiUsage } from '@/lib/ai-usage-tracker';
import { z } from 'zod';

export async function getAiUsage(): Promise<AiUsage> {
  return readAiUsage();
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('UNAVAILABLE');
      if (!isRetryable || attempt === maxAttempts) throw err;
      await new Promise(res => setTimeout(res, 1000 * attempt)); // 1s, 2s
    }
  }
  throw lastError;
}

const itemsSchema = z.array(
    z.object({
      sku: z.string(),
      quantity: z.number(),
    })
);

function getTrucksForFeet(totalLinearFeet: number): { truckType: TruckSuggestion['truckType']; trucksNeeded: number; summary: string } {
    if (totalLinearFeet <= 0) {
      return { truckType: 'LTL', trucksNeeded: 0, summary: 'No shipment items.' };
    }

    const fullTrucks = Math.floor(totalLinearFeet / 48);
    const remainingFeet = totalLinearFeet % 48;

    let overflowTruckType: 'LTL' | 'Half Truck' | 'Full Truck' | null = null;
    if (remainingFeet > 0) {
      if (remainingFeet < 14) {
        overflowTruckType = 'LTL';
      } else if (remainingFeet <= 24) {
        overflowTruckType = 'Half Truck';
      } else {
        overflowTruckType = 'Full Truck';
      }
    }

    const trucksNeeded = fullTrucks + (overflowTruckType ? 1 : 0);

    if (fullTrucks > 0 && overflowTruckType) {
      return {
        truckType: 'Mixed',
        trucksNeeded,
        summary: `${fullTrucks} Full Truck(s) and 1 ${overflowTruckType}`,
      };
    }

    if (fullTrucks > 0) {
      return { truckType: 'Full Truck', trucksNeeded: fullTrucks, summary: `${fullTrucks} Full Truck(s)` };
    }

    if (overflowTruckType) {
      return { truckType: overflowTruckType, trucksNeeded: 1, summary: `1 ${overflowTruckType}` };
    }

    return { truckType: 'LTL', trucksNeeded: 0, summary: 'Calculation error.' };
  }


export async function getTruckSuggestion(items: Item[]): Promise<TruckSuggestion> {
  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) {
      throw new Error("Invalid items provided.");
  }

  const itemsWithData: ItemWithData[] = parsedItems.data.map(item => {
    const data = skuData[item.sku];
    let adjustedQuantity = item.quantity;

    // Convert SQFT to Board Count for ISO products
    if (data?.category === 'ISO' && data.palletLength) {
        // Area per board is palletLength (4 or 8) * truck standard width contribution (4)
        const areaPerBoard = data.palletLength * 4;
        adjustedQuantity = Math.ceil(item.quantity / areaPerBoard);
    }

    return {
        ...item,
        ...data,
        quantity: adjustedQuantity, // Passing derived unit count (boards/rolls/etc) to AI
    };
  });

  if (itemsWithData.length === 0) {
    return {
        truckType: 'LTL',
        trucksNeeded: 0,
        packingNotes: 'No items to calculate.',
        linearFeet: 0,
    }
  }

  // Items that have the necessary data for the detailed packing flow
  const itemsForPacking: PackingSuggestionsInput['items'] = itemsWithData.filter(item =>
    item.category &&
    (item.rollsPerPallet || item.qtyPerPallet || item.boardsPerPallet) &&
    item.palletLength &&
    item.weightLbs
  ).map(item => ({ // ensure only needed properties are passed
    sku: item.sku,
    quantity: item.quantity,
    description: item.description,
    category: item.category,
    weightLbs: item.weightLbs,
    palletLength: item.palletLength,
    rollsPerPallet: item.rollsPerPallet,
    qtyPerPallet: item.qtyPerPallet,
    boardsPerPallet: item.boardsPerPallet,
  }));

  // Items that are missing some data and need the general estimation flow
  const itemsForEstimation: EstimateTruckRequirementsInput['items'] = itemsWithData.filter(item =>
    !itemsForPacking.find(p => p.sku === item.sku)
  ).map(item => ({
    sku: item.sku,
    quantity: item.quantity,
    weightLbs: item.weightLbs,
    lengthInches: item.lengthInches,
    widthInches: item.widthInches,
    heightInches: item.heightInches
  }));

  try {
    let packingResult: PackingSuggestionsOutput | null = null;
    let estimationResult: EstimateTruckRequirementsOutput | null = null;

    if (itemsForPacking.length > 0) {
        packingResult = await withRetry(() => providePackingSuggestions({ items: itemsForPacking }));
        await incrementAiUsage();
    }

    if (itemsForEstimation.length > 0) {
        estimationResult = await withRetry(() => estimateTruckRequirements({ items: itemsForEstimation }));
        await incrementAiUsage();
    }

    const packingFeet = packingResult?.linearFeet ?? 0;
    const estimationFeet = estimationResult?.truckRecommendation.linearFeet ?? 0;
    const totalLinearFeet = packingFeet + estimationFeet;

    const { truckType, trucksNeeded, summary } = getTrucksForFeet(totalLinearFeet);

    const combinedNotes = `--- Combined Recommendation ---\n` +
    `Based on a total of ${totalLinearFeet.toFixed(2)} linear feet, the recommendation is: ${summary}.\n\n` +
    (packingResult ? `--- Detailed Packing Plan (${packingFeet.toFixed(2)} ft) ---\n${packingResult.packingNotes}\n\n` : '') +
    (estimationResult ? `--- Additional Items Estimation (${estimationFeet.toFixed(2)} ft) ---\n${estimationResult.truckRecommendation.reasoning}`: '');

    const aiUsage = await readAiUsage();

    return {
        truckType,
        trucksNeeded,
        packingNotes: combinedNotes,
        linearFeet: totalLinearFeet,
        aiUsage: { count: aiUsage.count, remaining: aiUsage.remaining, limit: aiUsage.limit },
      };

  } catch (error) {
    console.error('Error getting truck suggestion:', error);
    if (error instanceof Error) {
        if (error.message.includes('DEADLINE_EXCEEDED')) {
            throw new Error('The calculation took too long to complete. Please try again with fewer items.');
        }
        if (error.message.includes('SAFETY')) {
            throw new Error('The request was blocked by safety settings. Please check the items and try again.');
        }
        if (error.message.includes('503') || error.message.includes('Service Unavailable') || error.message.includes('UNAVAILABLE')) {
            throw new Error('Gemini is experiencing high demand right now. Please wait a moment and try again.');
        }
    }
    throw new Error('An error occurred while calculating the truck requirements. Please try again.');
  }
}
