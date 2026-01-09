export type Item = {
  sku: string;
  quantity: number;
};

export type TruckSuggestion = {
  truckType: 'LTL' | 'Half Truck' | 'Full Truck';
  trucksNeeded: number;
  packingNotes: string;
};
