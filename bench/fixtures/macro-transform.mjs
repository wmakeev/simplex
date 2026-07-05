import { mulberry32, pick, chance } from './_prng.mjs'

// Realistic structural transform: map user records to display rows using
// property access, `??`, `&`, template literals, an extension method
// (`::length`) and computed indexing (protocol §5 macro; roadmap §6, §7 plus
// string ops). Dataset: 800 users with nested address objects and null holes
// (null names, whole-null address, null email/tags).
const EXPRESSION = [
  'users',
  '  | Arr.map(%, u =>',
  '      let name = (u.firstName ?? "") & " " & (u.lastName ?? ""),',
  '          addr = u.address,',
  '          city = addr.city ?? "N/A",',
  '          tags = u.tags ?? [],',
  '      {',
  '        id: u.id,',
  '        label: `${Str.trim(name)} <${u.email ?? "no-email"}>`,',
  '        location: `${city}, ${addr.country ?? "??"}`,',
  '        tagCount: tags::length(),',
  '        primaryTag: tags[0] ?? "none",',
  '        active: u.active == true,',
  '      })'
].join('\n')

export default {
  name: 'macro-transform',
  tags: ['transform', 'macro'],
  options: { stdlib: true },
  expression: EXPRESSION,
  makeData() {
    const r = mulberry32(20002)
    const first = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara']
    const last = ['Lovelace', 'Hopper', 'Turing', 'Dijkstra', 'Liskov']
    const cities = ['Berlin', 'Tokyo', 'Lima', 'Oslo']
    const countries = ['DE', 'JP', 'PE', 'NO']
    const allTags = ['vip', 'beta', 'staff', 'trial']
    const users = []
    for (let i = 0; i < 800; i++) {
      // Whole-null address hole (~10%) → null-safe `.city` / `.country`.
      const address = chance(r, 0.1)
        ? null
        : { city: pick(r, cities), country: pick(r, countries) }
      const tags = chance(r, 0.2)
        ? null
        : [pick(r, allTags), pick(r, allTags)]
      users.push({
        id: i,
        firstName: chance(r, 0.1) ? null : pick(r, first),
        lastName: chance(r, 0.1) ? null : pick(r, last),
        email: chance(r, 0.15) ? null : 'user' + i + '@example.com',
        address,
        tags,
        active: chance(r, 0.5)
      })
    }
    return { users }
  }
}
