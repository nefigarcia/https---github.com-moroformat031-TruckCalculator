'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Trash2, Loader2, FileText, Plus, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Item, TruckSuggestion } from '@/lib/types';
import { getTruckSuggestion } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { skuData } from '@/lib/sku-data';
import { Input } from '../ui/input';
import { TruckIcon } from '../ui/truck-icon';

const formSchema = z.object({
  sku: z.string().min(1, 'SKU is required.'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive number.'),
});

const ALL_SKUS = Object.keys(skuData).map(sku => ({
  value: sku,
  label: `${sku} - ${skuData[sku].description}`,
}));

export function TruckCalculator() {
  const [items, setItems] = useState<Item[]>([]);
  const [suggestion, setSuggestion] = useState<TruckSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sku: '',
      quantity: 1,
    },
  });

  function addItem(data: z.infer<typeof formSchema>) {
    setItems((prevItems) => [...prevItems, data]);
    form.reset({ sku: '', quantity: 1 });
  }

  function removeItem(index: number) {
    setItems((prevItems) => prevItems.filter((_, i) => i !== index));
  }

  async function handleCalculate() {
    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Items',
        description: 'Please add at least one item to calculate.',
      });
      return;
    }
    setIsLoading(true);
    setSuggestion(null);
    try {
      const result = await getTruckSuggestion(items);
      setSuggestion(result);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Calculation Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function getMixedSummary(packingNotes?: string) {
    if (!packingNotes) return 'Mixed Fleet Required';
    const m = packingNotes.match(/recommendation is:?\s*(.+)/i);
    if (m && m[1]) return m[1].trim().replace(/\.$/, '');
    return 'Mixed Fleet Required';
  }

  function getMixedTypes(packingNotes?: string) {
    const parsed = parseCombinedRecommendation(packingNotes);
    if (parsed.length > 0) return parsed.map(p => p.type);
    if (!packingNotes) return ['Full Truck', 'LTL'];
    const types: string[] = [];
    if (/full truck/i.test(packingNotes)) types.push('Full Truck');
    if (/half truck/i.test(packingNotes)) types.push('Half Truck');
    if (/\bltl\b/i.test(packingNotes) || /less[- ]than[- ]truck/i.test(packingNotes)) types.push('LTL');
    return types.length === 0 ? ['Full Truck', 'LTL'] : types;
  }
  function parseCombinedRecommendation(packingNotes?: string) {
    if (!packingNotes) return [] as { type: string; count: number }[];
    const summary = getMixedSummary(packingNotes);
    if (!summary) return [] as { type: string; count: number }[];
    const parts = summary.split(/\band\b/i).map(p => p.trim());
    const results: { type: string; count: number }[] = [];
    for (const part of parts) {
      // match patterns like '1 Full Truck(s)', '1 x Full Truck(s)', '1 LTL'
      const m = part.match(/(\d+)\s*(?:x|×)?\s*([A-Za-z ]+?)(?:\(|\.|,|$)/i);
      let count = 0;
      let raw = '';
      if (m) {
        count = parseInt(m[1], 10) || 0;
        raw = m[2].trim();
      } else {
        const m2 = part.match(/(\d+)/);
        if (m2) count = parseInt(m2[1], 10) || 0;
        raw = part;
      }

      if (/full/i.test(raw)) results.push({ type: 'Full Truck', count: count || 1 });
      else if (/half/i.test(raw)) results.push({ type: 'Half Truck', count: count || 1 });
      else if (/ltl/i.test(raw) || /less[- ]than[- ]truck/i.test(raw)) results.push({ type: 'LTL', count: count || 1 });
    }

    // aggregate counts preserving order
    const aggregated: Record<string, number> = {};
    const ordered: string[] = [];
    for (const r of results) {
      if (!ordered.includes(r.type)) ordered.push(r.type);
      aggregated[r.type] = (aggregated[r.type] || 0) + (r.count || 1);
    }
    return ordered.map(t => ({ type: t, count: aggregated[t] }));
  }

  // parsed counts for Mixed recommendations
  const mixedParsed = (suggestion && suggestion.truckType === 'Mixed')
    ? parseCombinedRecommendation(suggestion.packingNotes)
    : [];

  // truck capacities (linear feet)
  const TRUCK_CAPACITY: Record<string, number> = {
    'Full Truck': 48,
    'Half Truck': 24,
    'LTL': 14,
  };

  // compute per-type allocation (per truck) and occupancy percent
  const allocation: Record<string, { perTruckFeet: number; occupancy: number }> = {};
  if (suggestion) {
    const totalFeet = suggestion.linearFeet || 0;
    if (suggestion.truckType === 'Mixed') {
      const entries = mixedParsed.length > 0 ? mixedParsed : [];
      const totalCapacity = entries.reduce((s, e) => s + (e.count * (TRUCK_CAPACITY[e.type] || 0)), 0);
      for (const e of entries) {
        const cap = TRUCK_CAPACITY[e.type] || 48;
        const shareTotal = totalCapacity > 0 ? (e.count * cap) / totalCapacity : 0;
        const assignedTotalFeet = totalFeet * shareTotal;
        const perTruckFeet = e.count > 0 ? (assignedTotalFeet / e.count) : 0;
        const occupancy = cap > 0 ? Math.min(1, perTruckFeet / cap) : 0;
        allocation[e.type] = { perTruckFeet, occupancy };
      }
    } else {
      // single-type suggestion: distribute evenly across trucksNeeded
      const cap = TRUCK_CAPACITY[suggestion.truckType] || 48;
      const perTruckFeet = suggestion.trucksNeeded > 0 ? (totalFeet / suggestion.trucksNeeded) : 0;
      const occupancy = cap > 0 ? Math.min(1, perTruckFeet / cap) : 0;
      allocation[suggestion.truckType] = { perTruckFeet, occupancy };
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(addItem)} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem className="flex-grow">
                  <FormLabel>SKU</FormLabel>
                  <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-xs",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? ALL_SKUS.find((sku) => sku.value === field.value)?.label
                            : 'Select SKU'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Search SKU..." />
                        <CommandList>
                          <CommandEmpty>No SKU found.</CommandEmpty>
                          <CommandGroup>
                            {ALL_SKUS.map((sku) => (
                              <CommandItem
                                value={sku.label}
                                key={sku.value}
                                className="text-xs"
                                onSelect={() => {
                                  form.setValue('sku', sku.value);
                                  setPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    sku.value === field.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {sku.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem className="w-full sm:w-32">
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" variant="secondary">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </form>
        </Form>
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[100px]">Quantity</TableHead>
                <TableHead className="w-[50px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {item.sku} - {skuData[item.sku]?.description}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">Remove item</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleCalculate}
          disabled={items.length === 0 || isLoading}
          className="bg-accent text-accent-foreground shadow-md hover:bg-accent/90"
        >
          {isLoading ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Calculating...</>
          ) : (
            'Calculate Truck Requirements'
          )}
        </Button>
      </div>

      <div className={cn('transition-all duration-500 ease-in-out', suggestion ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none')}>
        {suggestion && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Shipment Recommendation</CardTitle>
              <CardDescription>Based on the items provided, here is our suggested shipping plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-6 rounded-lg bg-secondary/80 p-8">
                
                {suggestion.truckType === 'Mixed' ? (
                  <div className="flex items-center justify-center gap-4 sm:gap-8">
                    {getMixedTypes(suggestion.packingNotes).map((t, idx, arr) => {
                      const parsedEntry = mixedParsed.find(p => p.type === t);
                      const selected = true; // list contains only recommended types

                      return (
                        <div key={t} className="flex items-center gap-4">
                          <div className="flex flex-col items-center gap-3">
                            <TruckIcon
                              type={t}
                              className={cn(
                                'h-32 w-32 transition-all',
                                  selected ? 'text-accent drop-shadow-sm' : 'text-muted-foreground/40'
                              )}
                            />
                              <div className="flex flex-col items-center">
                                <div className={cn(
                                  'px-4 py-1 rounded-full border text-sm font-semibold whitespace-nowrap flex items-center justify-center',
                                  selected ? 'border-accent text-accent bg-white shadow-sm' : 'border-transparent text-muted-foreground/60'
                                )}>
                                  {parsedEntry ? `${parsedEntry.count} ${t}` : t}
                                </div>
                                {/* occupancy bar */}
                                <div className="mt-2 w-28 h-2 bg-white rounded overflow-hidden">
                                  <div
                                    className="h-2 bg-accent"
                                    style={{ width: allocation[t] ? `${Math.round(allocation[t].occupancy * 100)}%` : '0%', transition: 'width 800ms ease' }}
                                  />
                                </div>
                                {/* feet label */}
                                <div className="text-xs text-accent mt-1">
                                  {allocation[t] ? `${allocation[t].perTruckFeet.toFixed(1)} ft` : ''}
                                </div>
                              </div>
                          </div>
                          {idx < arr.length - 1 && <Plus className="h-6 w-6 text-muted-foreground/30 mt-[-24px]" />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <TruckIcon
                      type={suggestion.truckType}
                      className="h-48 w-48 text-accent drop-shadow-md"
                    />
                    <div className="px-5 py-1 rounded-full border border-accent text-accent bg-white text-sm font-bold shadow-sm">
                      {suggestion.trucksNeeded} × {suggestion.truckType}
                    </div>
                  </div>
                )}

                {/* concise textual summary for mixed recommendations (logic-only change) */}
               

                {suggestion.truckType === 'Mixed' && (
                  <p className="text-sm text-muted-foreground italic">See AI Packing Notes for logistics details.</p>
                )}
              </div>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="packing-notes" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-2 text-accent font-medium">
                      <FileText className="h-4 w-4" />
                      View AI Packing Notes
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm text-muted-foreground font-mono leading-relaxed border">
                    {suggestion.packingNotes}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}