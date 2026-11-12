const BASE = 'http://127.0.0.1:4173';
// Sequential requests from one IP; expect 429s after 120.
const counts = {};
for (let i = 0; i < 200; i++) {
  const r = await fetch(`${BASE}/api/fixtures`);
  counts[r.status] = (counts[r.status] || 0) + 1;
}
console.log('status distribution:', counts);
console.log('429s fired:', counts[429] || 0);
