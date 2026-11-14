/**
 * A deterministic e-commerce dataset used for the one-click demo: customers,
 * products and two years of orders with growth, seasonality and a few
 * realistic skews so that charts have something to show.
 */
import { createRandom } from './prng';
import type { CellValue, ColumnSpec } from './types';

export interface SampleTable {
  name: string;
  columns: ColumnSpec[];
  primaryKey: string;
  rows: CellValue[][];
}

export interface SampleDataset {
  tables: SampleTable[];
  /** Statements run after the tables are loaded (indexes and views). */
  postLoad: string[];
}

export interface SampleSizes {
  customers: number;
  products: number;
  orders: number;
}

export const DEFAULT_SAMPLE_SIZES: SampleSizes = { customers: 4000, products: 144, orders: 60_000 };

const FIRST_NAMES = [
  'Amira',
  'Liam',
  'Sofia',
  'Noah',
  'Yuki',
  'Mateo',
  'Layla',
  'Ethan',
  'Priya',
  'Omar',
  'Chloe',
  'Lucas',
  'Fatima',
  'Jonas',
  'Mei',
  'Daniel',
  'Aisha',
  'Hugo',
  'Nora',
  'Kenji',
  'Zara',
  'Felix',
  'Leila',
  'Arjun',
  'Emma',
  'Tariq',
  'Ines',
  'Oscar',
  'Hana',
  'Marco',
  'Sara',
  'Elias',
  'Maya',
  'Ravi',
  'Clara',
  'Yusuf',
] as const;

const LAST_NAMES = [
  'Haddad',
  'Tremblay',
  'Nguyen',
  'Schmidt',
  'Tanaka',
  'Silva',
  'Khan',
  'Martin',
  'Okafor',
  'Rossi',
  'Andersson',
  'Patel',
  'Dubois',
  'Kim',
  'Garcia',
  'Nasser',
  'Novak',
  'Wright',
  'Costa',
  'Ibrahim',
  'Fraser',
  'Moreau',
  'Sato',
  'Hughes',
  'Rahman',
  'Becker',
  'Lopez',
  'Singh',
  'Walker',
  'Mansour',
] as const;

const COUNTRIES = [
  ['Canada', 24],
  ['United States', 30],
  ['United Kingdom', 11],
  ['Germany', 8],
  ['France', 6],
  ['United Arab Emirates', 5],
  ['Australia', 5],
  ['Japan', 4],
  ['Brazil', 3],
  ['Jordan', 2],
  ['India', 2],
] as const;

const SEGMENTS = [
  ['Consumer', 62],
  ['Small business', 27],
  ['Enterprise', 11],
] as const;
const CHANNELS = [
  ['Web', 48],
  ['Mobile app', 31],
  ['Marketplace', 14],
  ['Retail partner', 7],
] as const;
const STATUSES = [
  ['delivered', 84],
  ['shipped', 7],
  ['returned', 5],
  ['cancelled', 4],
] as const;

const CATALOG = [
  {
    category: 'Audio',
    nouns: ['Headphones', 'Earbuds', 'Speaker', 'Soundbar', 'Turntable', 'Microphone'],
    price: [39, 420],
  },
  {
    category: 'Wearables',
    nouns: ['Smartwatch', 'Fitness Band', 'Sleep Ring', 'Running Pod'],
    price: [59, 520],
  },
  {
    category: 'Home office',
    nouns: ['Monitor', 'Keyboard', 'Webcam', 'Desk Lamp', 'Dock', 'Standing Desk'],
    price: [29, 780],
  },
  {
    category: 'Cameras',
    nouns: ['Action Camera', 'Mirrorless Body', 'Prime Lens', 'Tripod', 'Gimbal'],
    price: [45, 1650],
  },
  {
    category: 'Gaming',
    nouns: ['Controller', 'Headset', 'Mouse', 'Capture Card', 'Racing Wheel'],
    price: [35, 460],
  },
  {
    category: 'Accessories',
    nouns: ['Charger', 'Cable Kit', 'Power Bank', 'Sleeve', 'Stand', 'Hub'],
    price: [12, 110],
  },
] as const;

const ADJECTIVES = [
  'Aero',
  'Nova',
  'Pulse',
  'Vertex',
  'Lumen',
  'Atlas',
  'Echo',
  'Orbit',
  'Summit',
  'Drift',
  'Ember',
  'Tidal',
] as const;
const TIERS = ['', ' Pro', ' Mini', ' Max', ' SE'] as const;

const MONTHS = 24;
/** Orders run from November 2024 to October 2026. */
const FIRST_MONTH = { year: 2024, month: 10 };

const pad = (value: number): string => String(value).padStart(2, '0');
const names = <T extends readonly (readonly [string, number])[]>(pairs: T): string[] =>
  pairs.map(([name]) => name);
const weights = <T extends readonly (readonly [string, number])[]>(pairs: T): number[] =>
  pairs.map(([, weight]) => weight);

export function buildSampleDataset(
  seed = 20261111,
  sizes: SampleSizes = DEFAULT_SAMPLE_SIZES,
): SampleDataset {
  const random = createRandom(seed);

  const monthStart = (offset: number): { year: number; month: number } => {
    const index = FIRST_MONTH.month + offset;
    return { year: FIRST_MONTH.year + Math.floor(index / 12), month: index % 12 };
  };
  const randomTimestamp = (offset: number): string => {
    const { year, month } = monthStart(offset);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${pad(month + 1)}-${pad(random.int(1, daysInMonth))} ${pad(random.int(7, 23))}:${pad(random.int(0, 59))}:${pad(random.int(0, 59))}`;
  };

  // Products ---------------------------------------------------------------
  const products: CellValue[][] = [];
  const productPrice: number[] = [];
  const productWeight: number[] = [];
  const usedNames = new Set<string>();
  for (let id = 1; id <= sizes.products; id++) {
    const group = CATALOG[(id - 1) % CATALOG.length] as (typeof CATALOG)[number];
    let name: string;
    do {
      name = `${random.pick(ADJECTIVES)} ${random.pick(group.nouns)}${random.pick(TIERS)}`;
    } while (usedNames.has(name) && usedNames.size < 2000);
    usedNames.add(name);
    const [low, high] = group.price;
    // Skew towards the cheaper end of each category's range.
    const price = Math.round((low + (high - low) * random.next() ** 2) * 100 - 1) / 100;
    const cost = Math.round(price * (0.42 + random.next() * 0.26) * 100) / 100;
    products.push([id, name, group.category, price, cost]);
    productPrice.push(price);
    // A long tail: a handful of products sell far more than the rest.
    productWeight.push(1 / (1 + (id % 37)) + random.next() * 0.15);
  }

  // Customers --------------------------------------------------------------
  const customers: CellValue[][] = [];
  const customerWeight: number[] = [];
  for (let id = 1; id <= sizes.customers; id++) {
    const first = random.pick(FIRST_NAMES);
    const last = random.pick(LAST_NAMES);
    const segment = names(SEGMENTS)[random.weighted(weights(SEGMENTS))] as string;
    const country = names(COUNTRIES)[random.weighted(weights(COUNTRIES))] as string;
    const signedUp = randomTimestamp(random.int(0, MONTHS - 1)).slice(0, 10);
    const email = `${first}.${last}${id}@example.com`.toLowerCase();
    customers.push([id, `${first} ${last}`, email, country, segment, signedUp]);
    customerWeight.push(
      (segment === 'Enterprise' ? 5 : segment === 'Small business' ? 2 : 1) * (0.3 + random.next()),
    );
  }

  // Orders -----------------------------------------------------------------
  // Steady growth plus a November–December peak and a soft summer.
  const seasonal = [1.0, 0.96, 1.02, 1.0, 1.04, 0.97, 0.9, 0.93, 1.05, 1.1, 1.38, 1.52];
  const monthWeight = Array.from({ length: MONTHS }, (_, offset) => {
    const { month } = monthStart(offset);
    return (1 + offset * 0.045) * (seasonal[month] as number);
  });

  const cumulative = (values: number[]): number[] => {
    let total = 0;
    return values.map((value) => (total += value));
  };
  const pickCumulative = (sums: number[]): number => {
    const roll = random.next() * (sums[sums.length - 1] as number);
    let low = 0;
    let high = sums.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((sums[middle] as number) > roll) high = middle;
      else low = middle + 1;
    }
    return low;
  };
  const productSums = cumulative(productWeight);
  const customerSums = cumulative(customerWeight);
  const monthSums = cumulative(monthWeight);

  const orders: CellValue[][] = [];
  for (let id = 1; id <= sizes.orders; id++) {
    const productIndex = pickCumulative(productSums);
    const price = productPrice[productIndex] as number;
    const quantity = price > 300 ? 1 : random.weighted([60, 24, 9, 4, 3]) + 1;
    const discount = random.next() < 0.28 ? random.pick([0.05, 0.1, 0.15, 0.2, 0.25]) : 0;
    orders.push([
      id,
      pickCumulative(customerSums) + 1,
      productIndex + 1,
      quantity,
      discount,
      names(CHANNELS)[random.weighted(weights(CHANNELS))] as string,
      names(STATUSES)[random.weighted(weights(STATUSES))] as string,
      randomTimestamp(pickCumulative(monthSums)),
    ]);
  }

  return {
    tables: [
      {
        name: 'customers',
        primaryKey: 'id',
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'TEXT' },
          { name: 'email', type: 'TEXT' },
          { name: 'country', type: 'TEXT' },
          { name: 'segment', type: 'TEXT' },
          { name: 'signed_up_on', type: 'TEXT' },
        ],
        rows: customers,
      },
      {
        name: 'products',
        primaryKey: 'id',
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'TEXT' },
          { name: 'category', type: 'TEXT' },
          { name: 'unit_price', type: 'REAL' },
          { name: 'unit_cost', type: 'REAL' },
        ],
        rows: products,
      },
      {
        name: 'orders',
        primaryKey: 'id',
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'customer_id', type: 'INTEGER' },
          { name: 'product_id', type: 'INTEGER' },
          { name: 'quantity', type: 'INTEGER' },
          { name: 'discount', type: 'REAL' },
          { name: 'channel', type: 'TEXT' },
          { name: 'status', type: 'TEXT' },
          { name: 'ordered_at', type: 'TEXT' },
        ],
        rows: orders,
      },
    ],
    postLoad: [
      'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_product ON orders (product_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders (ordered_at)',
      'DROP VIEW IF EXISTS order_facts',
      `CREATE VIEW order_facts AS
SELECT
  o.id AS order_id,
  o.ordered_at,
  o.channel,
  o.status,
  c.id AS customer_id,
  c.name AS customer,
  c.country,
  c.segment,
  p.name AS product,
  p.category,
  o.quantity,
  ROUND(o.quantity * p.unit_price * (1 - o.discount), 2) AS revenue,
  ROUND(o.quantity * (p.unit_price * (1 - o.discount) - p.unit_cost), 2) AS profit
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id`,
    ],
  };
}
