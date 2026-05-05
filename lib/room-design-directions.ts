import type { StoredFloorPlan } from "./types";

export type RoomDesignCategory =
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bath"
  | "office"
  | "entry"
  | "garage"
  | "utility"
  | "general";

export type RoomDesignDirection = {
  id: string;
  floor: number;
  label: string;
  areaSqFt: number;
  category: RoomDesignCategory;
  direction: string;
};

export type RoomDesignDirectionReport = {
  roomCount: number;
  floorCount: number;
  directions: RoomDesignDirection[];
  directionText: string;
  summary: string;
};

const MAX_DIRECTION_ROOMS = 14;

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getRoomCategory(label: string): RoomDesignCategory {
  const normalized = label.toLowerCase();

  if (includesAny(normalized, ["living", "family", "great room", "den", "lounge"])) {
    return "living";
  }

  if (includesAny(normalized, ["kitchen", "pantry"])) {
    return "kitchen";
  }

  if (includesAny(normalized, ["dining", "breakfast", "nook"])) {
    return "dining";
  }

  if (includesAny(normalized, ["bed", "suite", "bunk", "primary", "master"])) {
    return "bedroom";
  }

  if (includesAny(normalized, ["bath", "powder", "toilet", "wc"])) {
    return "bath";
  }

  if (includesAny(normalized, ["office", "study", "work", "flex"])) {
    return "office";
  }

  if (includesAny(normalized, ["foyer", "entry", "mud", "porch", "hall"])) {
    return "entry";
  }

  if (includesAny(normalized, ["garage", "carport"])) {
    return "garage";
  }

  if (includesAny(normalized, ["laundry", "utility", "mechanical", "closet", "storage"])) {
    return "utility";
  }

  return "general";
}

function getCategoryPriority(category: RoomDesignCategory) {
  const priorities: Record<RoomDesignCategory, number> = {
    living: 0,
    kitchen: 1,
    dining: 2,
    entry: 3,
    bedroom: 4,
    office: 5,
    bath: 6,
    garage: 7,
    utility: 8,
    general: 9
  };

  return priorities[category];
}

function formatArea(areaSqFt: number) {
  return Number.isFinite(areaSqFt) && areaSqFt > 0 ? `${Math.round(areaSqFt)} sq ft` : "area TBD";
}

function getDirectionForCategory(category: RoomDesignCategory, styleLabel: string) {
  switch (category) {
    case "living":
      return `make this the strongest daylight and gathering zone, with generous windows, a clear furniture wall, and exterior massing that feels aligned with the ${styleLabel} direction`;
    case "kitchen":
      return "prioritize a practical work triangle, clean cabinet runs, task lighting, and window placement that supports counters without making the exterior feel random";
    case "dining":
      return "keep the dining area connected to the kitchen and outdoor living, with balanced glazing and enough wall surface for furniture or built-ins";
    case "bedroom":
      return "protect privacy while keeping calm natural light, simple window rhythm, and enough clear wall length for bed placement";
    case "bath":
      return "use modest privacy glazing, compact fixture logic, and exterior window placement that does not compete with primary facade features";
    case "office":
      return "favor quiet daylight, camera-friendly wall space, and window placement that reads intentional from the exterior";
    case "entry":
      return "clarify arrival, storage, and circulation so the exterior entry sequence feels deliberate and easy to understand";
    case "garage":
      return "keep vehicle/service massing visually secondary, with simple doors and materials that support the main house character";
    case "utility":
      return "keep service functions compact and understated, with practical ventilation or access cues kept out of primary sightlines";
    default:
      return "keep proportions, daylight, circulation, and furniture zones resolved so this room supports the overall home concept";
  }
}

function getRoomLabel(label: string, fallbackIndex: number) {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : `Room ${fallbackIndex}`;
}

export function buildRoomDesignDirectionReport(args: {
  floorPlans: StoredFloorPlan[];
  styleLabel: string;
}): RoomDesignDirectionReport {
  const rooms = args.floorPlans.flatMap((floorPlan) =>
    floorPlan.data.rooms.map((room, index) => {
      const label = getRoomLabel(room.label, index + 1);
      const category = getRoomCategory(label);

      return {
        id: `${floorPlan.floor}-${room.id}`,
        floor: floorPlan.floor,
        label,
        areaSqFt: room.areaSqFt,
        category,
        direction: getDirectionForCategory(category, args.styleLabel)
      };
    })
  );

  const directions = [...rooms]
    .sort((left, right) => {
      if (left.floor !== right.floor) {
        return left.floor - right.floor;
      }

      const priorityDelta = getCategoryPriority(left.category) - getCategoryPriority(right.category);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return right.areaSqFt - left.areaSqFt;
    })
    .slice(0, MAX_DIRECTION_ROOMS);

  const directionText = directions
    .map(
      (room) =>
        `Floor ${room.floor} ${room.label} (${formatArea(room.areaSqFt)}): ${room.direction}.`
    )
    .join("\n");

  return {
    roomCount: rooms.length,
    floorCount: args.floorPlans.length,
    directions,
    directionText,
    summary:
      rooms.length === 0
        ? "Add room polygons to create room-by-room render direction."
        : `${directions.length} room direction${directions.length === 1 ? "" : "s"} ready from ${rooms.length} detected room${rooms.length === 1 ? "" : "s"}.`
  };
}
