import {
  Axe,
  Backpack,
  Bike,
  Blender,
  Camera,
  Compass,
  CookingPot,
  Drill,
  Dumbbell,
  Flashlight,
  Flower2,
  Hammer,
  HardHat,
  Microwave,
  Package,
  PaintRoller,
  Projector,
  Ruler,
  Shovel,
  SprayCan,
  Sprout,
  Tent,
  Toolbox,
  Tractor,
  TreePine,
  Utensils,
  WashingMachine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Category, ToolIcon } from "@/convex/lib/validators";

/** Every pickable icon (convex/lib/validators.ts TOOL_ICONS) with its Lucide component. */
export const TOOL_ICON_OPTIONS: Record<ToolIcon, { icon: LucideIcon; label: string }> = {
  drill: { icon: Drill, label: "Drill" },
  hammer: { icon: Hammer, label: "Hammer" },
  wrench: { icon: Wrench, label: "Wrench" },
  toolbox: { icon: Toolbox, label: "Toolbox" },
  "paint-roller": { icon: PaintRoller, label: "Paint roller" },
  ruler: { icon: Ruler, label: "Ruler" },
  axe: { icon: Axe, label: "Axe" },
  "hard-hat": { icon: HardHat, label: "Hard hat" },
  shovel: { icon: Shovel, label: "Shovel" },
  sprout: { icon: Sprout, label: "Plants" },
  flower: { icon: Flower2, label: "Flowers" },
  tree: { icon: TreePine, label: "Tree" },
  tractor: { icon: Tractor, label: "Tractor" },
  "cooking-pot": { icon: CookingPot, label: "Cooking pot" },
  utensils: { icon: Utensils, label: "Utensils" },
  blender: { icon: Blender, label: "Blender" },
  microwave: { icon: Microwave, label: "Microwave" },
  tent: { icon: Tent, label: "Tent" },
  flashlight: { icon: Flashlight, label: "Flashlight" },
  backpack: { icon: Backpack, label: "Backpack" },
  compass: { icon: Compass, label: "Compass" },
  bike: { icon: Bike, label: "Bike" },
  dumbbell: { icon: Dumbbell, label: "Dumbbell" },
  "spray-can": { icon: SprayCan, label: "Spray can" },
  "washing-machine": { icon: WashingMachine, label: "Washing machine" },
  camera: { icon: Camera, label: "Camera" },
  projector: { icon: Projector, label: "Projector" },
  package: { icon: Package, label: "Package" },
};

/** Shown when the lender didn't pick an icon. */
export const CATEGORY_DEFAULT_ICON: Record<Category, ToolIcon> = {
  power_tools: "drill",
  hand_tools: "hammer",
  garden: "sprout",
  kitchen: "cooking-pot",
  camping: "tent",
  cleaning: "spray-can",
  sports: "bike",
  other: "package",
};

/** The icon to show: the lender's pick, or the category default. */
export function toolIconName(tool: { icon?: ToolIcon; category: Category }): ToolIcon {
  return tool.icon ?? CATEGORY_DEFAULT_ICON[tool.category];
}
