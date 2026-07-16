import type {
  DrinkFamily,
  HojichaLevel,
  MatchaLevel,
  MoneyCentavos,
  Powder,
  MenuProduct,
  ProductSlug,
  Sweetness,
} from './contracts'

export const POWDER_UPCHARGES: Readonly<Record<Powder, MoneyCentavos>> = {
  yumeno: 0,
  mk_isuzu: 6000,
}

export const DEFAULT_POWDER: Powder = 'yumeno'
export const DEFAULT_MATCHA_LEVEL: MatchaLevel = 1
export const DEFAULT_HOJICHA_LEVEL: HojichaLevel = 1

export const MATCHA_LEVEL_UPCHARGES: Readonly<Record<MatchaLevel, MoneyCentavos>> = {
  1: 0,
  2: 2500,
  3: 5000,
}

export const HOJICHA_LEVEL_UPCHARGES: Readonly<Record<HojichaLevel, MoneyCentavos>> = {
  1: 0,
  2: 2000,
  3: 4000,
}

export const MATCHA_LEVEL_LABELS: Readonly<Record<MatchaLevel, string>> = {
  1: 'Level 1 · 5g',
  2: 'Level 2',
  3: 'Level 3',
}

export const HOJICHA_LEVEL_LABELS: Readonly<Record<HojichaLevel, string>> = {
  1: 'Level 1 · 6g',
  2: 'Level 2',
  3: 'Level 3',
}

export const SWEETNESS_OPTIONS: readonly Sweetness[] = ['none', 'light', 'regular', 'extra']

export const THERMAL_BAG_PRICES: Readonly<Record<1 | 2 | 3 | 4, MoneyCentavos>> = {
  1: 2500,
  2: 3000,
  3: 3500,
  4: 3500,
}

export const PRODUCT_CATALOG: Readonly<Record<ProductSlug, MenuProduct>> = {
  'matcha-latte': {
    slug: 'matcha-latte',
    name: 'Matcha Latte',
    family: 'matcha',
    flavor: 'plain',
    milk: 'oat_milk',
    basePriceCentavos: 20000,
    modifierGroups: ['matcha_level', 'powder', 'sweetness'],
  },
  'strawberry-matcha': {
    slug: 'strawberry-matcha',
    name: 'Strawberry Matcha',
    family: 'matcha',
    flavor: 'strawberry',
    milk: 'oat_milk',
    basePriceCentavos: 22000,
    modifierGroups: ['matcha_level', 'powder'],
  },
  'salted-maple-matcha': {
    slug: 'salted-maple-matcha',
    name: 'Salted Maple Matcha',
    family: 'matcha',
    flavor: 'salted_maple',
    milk: 'oat_milk',
    basePriceCentavos: 22000,
    modifierGroups: ['matcha_level', 'powder'],
  },
  'hojicha-latte': {
    slug: 'hojicha-latte',
    name: 'Hojicha Latte',
    family: 'hojicha',
    flavor: 'plain',
    milk: 'oat_milk',
    basePriceCentavos: 18000,
    modifierGroups: ['hojicha_level', 'powder', 'sweetness'],
  },
  'strawberry-hojicha': {
    slug: 'strawberry-hojicha',
    name: 'Strawberry Hojicha',
    family: 'hojicha',
    flavor: 'strawberry',
    milk: 'oat_milk',
    basePriceCentavos: 20000,
    modifierGroups: ['hojicha_level', 'powder'],
  },
  'salted-maple-hojicha': {
    slug: 'salted-maple-hojicha',
    name: 'Salted Maple Hojicha',
    family: 'hojicha',
    flavor: 'salted_maple',
    milk: 'oat_milk',
    basePriceCentavos: 20000,
    modifierGroups: ['hojicha_level', 'powder'],
  },
}

export function getLevelUpcharges(family: DrinkFamily): Readonly<Record<1 | 2 | 3, MoneyCentavos>> {
  return family === 'matcha' ? MATCHA_LEVEL_UPCHARGES : HOJICHA_LEVEL_UPCHARGES
}
