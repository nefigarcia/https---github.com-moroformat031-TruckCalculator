
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Trash2, Loader2, Truck, FileText } from 'lucide-react';

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
import { Check, ChevronsUpDown } from 'lucide-react';
import { Input } from '../ui/input';

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
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? ALL_SKUS.find(
                                (sku) => sku.value === field.value
                              )?.label
                            : "Select SKU"}
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
                                onSelect={() => {
                                  form.setValue("sku", sku.value);
                                  setPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    sku.value === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
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
                  <TableCell className="font-medium">{item.sku}</TableCell>
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
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Calculating...
            </>
          ) : (
            'Calculate Truck Requirements'
          )}
        </Button>
      </div>

      <div
        className={cn(
          'transition-all duration-500 ease-in-out',
          suggestion ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        {suggestion && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Shipment Recommendation</CardTitle>
              <CardDescription>Based on the items provided, here is our suggested shipping plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-4 rounded-lg bg-secondary/80 p-6">
                <div className="flex flex-wrap justify-center gap-4">
                  {Array.from({ length: suggestion.trucksNeeded }).map((_, i) => (
                    <Truck key={i} className="h-16 w-16 text-primary" />
                  ))}
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {suggestion.trucksNeeded} &times; {suggestion.truckType}
                </p>
              </div>

              <Accordion type="single" collapsible>
                <AccordionItem value="packing-notes">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      View AI Packing Notes
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-wrap text-sm text-muted-foreground">
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
