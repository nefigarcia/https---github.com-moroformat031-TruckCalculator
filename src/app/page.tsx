import { TruckCalculator } from '@/components/app/truck-calculator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-background p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-4xl space-y-8">
        <header className="flex items-center gap-4">
          <div className="rounded-lg bg-white p-2">
            <img
              src="https://www.kingspanroofing.com/content/dam/krw/logos/krw-logo-blue-web.svg"
              alt="Kingspan Roofing"
              className="h-8 w-8 object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Loading Tool
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
