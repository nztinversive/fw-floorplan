export type FurnitureCategory =
  | "Living Room"
  | "Bedroom"
  | "Bathroom"
  | "Kitchen"
  | "Dining"
  | "Office";

export type FurnitureCatalogItem = {
  id: string;
  category: FurnitureCategory;
  label: string;
  width: number;
  depth: number;
  icon: string;
};

export const FURNITURE_CATEGORIES: FurnitureCategory[] = [
  "Living Room",
  "Bedroom",
  "Bathroom",
  "Kitchen",
  "Dining",
  "Office"
];

export const FURNITURE_LIBRARY: FurnitureCatalogItem[] = [
  { id: "couch", category: "Living Room", label: "Couch", width: 84, depth: 36, icon: "🛋️" },
  { id: "loveseat", category: "Living Room", label: "Loveseat", width: 60, depth: 36, icon: "🛋️" },
  { id: "armchair", category: "Living Room", label: "Armchair", width: 36, depth: 36, icon: "🪑" },
  {
    id: "coffee-table",
    category: "Living Room",
    label: "Coffee Table",
    width: 48,
    depth: 24,
    icon: "◫"
  },
  { id: "tv-stand", category: "Living Room", label: "TV Stand", width: 60, depth: 18, icon: "🖥️" },
  { id: "queen-bed", category: "Bedroom", label: "Queen Bed", width: 60, depth: 80, icon: "🛏️" },
  { id: "king-bed", category: "Bedroom", label: "King Bed", width: 76, depth: 80, icon: "🛏️" },
  { id: "twin-bed", category: "Bedroom", label: "Twin Bed", width: 38, depth: 75, icon: "🛏️" },
  { id: "nightstand", category: "Bedroom", label: "Nightstand", width: 24, depth: 24, icon: "▣" },
  { id: "dresser", category: "Bedroom", label: "Dresser", width: 60, depth: 18, icon: "🧰" },
  { id: "toilet", category: "Bathroom", label: "Toilet", width: 18, depth: 28, icon: "🚽" },
  { id: "sink-vanity", category: "Bathroom", label: "Sink Vanity", width: 48, depth: 22, icon: "🚰" },
  { id: "bathtub", category: "Bathroom", label: "Bathtub", width: 60, depth: 30, icon: "🛁" },
  { id: "shower", category: "Bathroom", label: "Shower", width: 36, depth: 36, icon: "⬚" },
  { id: "refrigerator", category: "Kitchen", label: "Refrigerator", width: 36, depth: 30, icon: "🧊" },
  { id: "stove", category: "Kitchen", label: "Stove", width: 30, depth: 26, icon: "🔥" },
  { id: "dishwasher", category: "Kitchen", label: "Dishwasher", width: 24, depth: 24, icon: "◧" },
  {
    id: "kitchen-island",
    category: "Kitchen",
    label: "Kitchen Island",
    width: 72,
    depth: 36,
    icon: "▭"
  },
  {
    id: "dining-table-4",
    category: "Dining",
    label: "Dining Table (4)",
    width: 48,
    depth: 48,
    icon: "⬛"
  },
  {
    id: "dining-table-6",
    category: "Dining",
    label: "Dining Table (6)",
    width: 72,
    depth: 36,
    icon: "▭"
  },
  { id: "dining-chair", category: "Dining", label: "Dining Chair", width: 18, depth: 18, icon: "🪑" },
  { id: "desk", category: "Office", label: "Desk", width: 48, depth: 24, icon: "⌨️" },
  { id: "office-chair", category: "Office", label: "Office Chair", width: 24, depth: 24, icon: "🪑" },
  { id: "washer", category: "Office", label: "Washer", width: 27, depth: 27, icon: "🧺" },
  { id: "dryer", category: "Office", label: "Dryer", width: 27, depth: 27, icon: "◌" }
];

export const FURNITURE_BY_ID = Object.fromEntries(
  FURNITURE_LIBRARY.map((item) => [item.id, item])
) as Record<string, FurnitureCatalogItem>;
