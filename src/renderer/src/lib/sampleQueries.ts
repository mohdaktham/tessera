import type { ChartConfig } from './chart';

export interface SampleQuery {
  id: string;
  name: string;
  sql: string;
  chart: ChartConfig;
  /** Width on the dashboard grid, in columns out of four. */
  span: 1 | 2 | 4;
  onDashboard: boolean;
}

/** Saved queries and dashboard tiles that ship with the sample dataset. */
export const SAMPLE_QUERIES: SampleQuery[] = [
  {
    id: 'sample-kpis',
    name: 'Headline numbers',
    span: 4,
    onDashboard: true,
    chart: { type: 'number', x: null, y: ['revenue', 'orders', 'average_order', 'customers'] },
    sql: `SELECT
  ROUND(SUM(revenue)) AS revenue,
  COUNT(*) AS orders,
  ROUND(AVG(revenue), 2) AS average_order,
  COUNT(DISTINCT customer_id) AS customers
FROM order_facts
WHERE status <> 'cancelled';`,
  },
  {
    id: 'sample-monthly-revenue',
    name: 'Monthly revenue',
    span: 2,
    onDashboard: true,
    chart: { type: 'area', x: 'month', y: ['revenue'] },
    sql: `SELECT
  strftime('%Y-%m', ordered_at) AS month,
  ROUND(SUM(revenue)) AS revenue
FROM order_facts
WHERE status <> 'cancelled'
GROUP BY month
ORDER BY month;`,
  },
  {
    id: 'sample-category',
    name: 'Revenue and profit by category',
    span: 2,
    onDashboard: true,
    chart: { type: 'bar', x: 'category', y: ['revenue', 'profit'] },
    sql: `SELECT
  category,
  ROUND(SUM(revenue)) AS revenue,
  ROUND(SUM(profit)) AS profit
FROM order_facts
WHERE status <> 'cancelled'
GROUP BY category
ORDER BY revenue DESC;`,
  },
  {
    id: 'sample-channel',
    name: 'Orders by channel',
    span: 1,
    onDashboard: true,
    chart: { type: 'pie', x: 'channel', y: ['orders'] },
    sql: `SELECT channel, COUNT(*) AS orders
FROM orders
GROUP BY channel
ORDER BY orders DESC;`,
  },
  {
    id: 'sample-countries',
    name: 'Top countries by revenue',
    span: 1,
    onDashboard: true,
    chart: { type: 'bar', x: 'country', y: ['revenue'] },
    sql: `SELECT country, ROUND(SUM(revenue)) AS revenue
FROM order_facts
WHERE status <> 'cancelled'
GROUP BY country
ORDER BY revenue DESC
LIMIT 8;`,
  },
  {
    id: 'sample-growth',
    name: 'Month-over-month growth',
    span: 2,
    onDashboard: true,
    chart: { type: 'line', x: 'month', y: ['growth_pct'] },
    sql: `-- Window function: compare each month with the one before it.
WITH monthly AS (
  SELECT strftime('%Y-%m', ordered_at) AS month, SUM(revenue) AS revenue
  FROM order_facts
  WHERE status <> 'cancelled'
  GROUP BY month
)
SELECT
  month,
  ROUND(revenue) AS revenue,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
        / LAG(revenue) OVER (ORDER BY month), 1) AS growth_pct
FROM monthly
ORDER BY month;`,
  },
  {
    id: 'sample-top-customers',
    name: 'Top customers and their share',
    span: 2,
    onDashboard: false,
    chart: { type: 'bar', x: 'customer', y: ['revenue'] },
    sql: `-- Rank customers and show the running share of total revenue.
WITH totals AS (
  SELECT customer, segment, country, SUM(revenue) AS revenue
  FROM order_facts
  WHERE status <> 'cancelled'
  GROUP BY customer_id
)
SELECT
  RANK() OVER (ORDER BY revenue DESC) AS rank,
  customer,
  segment,
  country,
  ROUND(revenue, 2) AS revenue,
  ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC)
        / SUM(revenue) OVER (), 2) AS cumulative_share_pct
FROM totals
ORDER BY revenue DESC
LIMIT 50;`,
  },
  {
    id: 'sample-returns',
    name: 'Return rate by category',
    span: 2,
    onDashboard: false,
    chart: { type: 'bar', x: 'category', y: ['return_rate_pct'] },
    sql: `SELECT
  category,
  COUNT(*) AS orders,
  SUM(status = 'returned') AS returned,
  ROUND(100.0 * SUM(status = 'returned') / COUNT(*), 2) AS return_rate_pct
FROM order_facts
GROUP BY category
ORDER BY return_rate_pct DESC;`,
  },
];

export const WELCOME_SQL = `-- Welcome to Tessera.
-- Press Ctrl+Enter (Cmd+Enter on a Mac) to run this query,
-- or select part of it to run only that part.

SELECT
  category,
  COUNT(*) AS orders,
  ROUND(SUM(revenue)) AS revenue,
  ROUND(AVG(revenue), 2) AS average_order
FROM order_facts
WHERE status <> 'cancelled'
GROUP BY category
ORDER BY revenue DESC;
`;
