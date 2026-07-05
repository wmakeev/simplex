import { mulberry32, randInt, pick, chance } from './_prng.mjs'

// Realistic report: filter orders, group by customer region, aggregate revenue,
// then shape and rank the result. Exercises Arr.filter/fold/map/sort,
// Obj.entries, Math.round, exists, `??`, spread, computed keys, lambdas and a
// long pipe (measurement-protocol §5 macro; roadmap §1–§9 combined). Dataset:
// 1000 orders with nested customer objects and null holes (null totals, null
// regions, whole-null customers). Cold representative for the macro tier.
const EXPRESSION = [
  'orders',
  '  | Arr.filter(%, o => exists(o.total) and o.status != "cancelled")',
  '  | Arr.fold(%, (acc, o) =>',
  '      let region = o.customer.region ?? "unknown",',
  '          prev = acc[region] ?? { count: 0, revenue: 0 },',
  '      { ...acc, [region]: {',
  '          count: prev.count + 1,',
  '          revenue: prev.revenue + o.total,',
  '      } }',
  '    , {})',
  '  | Obj.entries(%)',
  '  | Arr.map(%, e =>',
  '      let region = e[0], stats = e[1],',
  '      {',
  '        region: region,',
  '        count: stats.count,',
  '        avg: Math.round(stats.revenue / stats.count),',
  '      })',
  '  | Arr.sort(%, (a, b) => b.count - a.count)'
].join('\n')

export default {
  name: 'macro-report',
  tags: ['report', 'macro', 'cold'],
  options: { stdlib: true },
  expression: EXPRESSION,
  makeData() {
    const r = mulberry32(20001)
    const regions = ['emea', 'apac', 'amer', 'latam']
    const statuses = ['paid', 'pending', 'cancelled', 'refunded']
    const orders = []
    for (let i = 0; i < 1000; i++) {
      // Whole-null customer hole (~5%) exercises null-safe `.region`.
      const customer = chance(r, 0.05)
        ? null
        : {
            id: i,
            name: pick(r, ['acme', 'globex', 'initech', 'umbrella']),
            // Null region hole (~15%) → `?? "unknown"`.
            region: chance(r, 0.15) ? null : pick(r, regions)
          }
      orders.push({
        id: i,
        // Null total hole (~10%) filtered out by `exists(o.total)`.
        total: chance(r, 0.1) ? null : randInt(r, 10, 5000),
        status: pick(r, statuses),
        customer
      })
    }
    return { orders }
  }
}
