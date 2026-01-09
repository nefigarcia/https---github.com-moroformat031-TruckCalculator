import { TruckCalculator } from '@/components/app/truck-calculator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-background p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-4xl space-y-8">
        <header className="flex items-center gap-4">
          <div className="rounded-lg bg-primary p-2">
            <Truck className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Truck Calculator
          </h1>
        </header>
        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle>Shipment Details</CardTitle>
            <CardDescription>
              Add items to your shipment, then click calculate to get a truck recommendation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TruckCalculator />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
