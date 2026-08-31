# players.json — NFL active-player extract

- **Source:** `https://api.sleeper.app/v1/players/nfl` (read-only public endpoint; ~14.6 MB raw)
- **Snapshot date:** 2026-08-31 (post roster cutdowns, pre draft-day Sep 7 — frozen on purpose, no runtime dependency on Sleeper)
- **Contents:** 2,659 active players with a team, as `[{n: "Full Name", t: "TEAM", p: "POS"}]`, sorted by name. Team `OAK` normalized to `LV`. Team-defense pseudo-players excluded.
- **Consumer:** `js/form.js` lazy-loads it on first focus of the Player-name field to feed the `<datalist>` typeahead + team auto-fill.

## Regenerate

```sh
curl -sS -o /tmp/players-raw.json https://api.sleeper.app/v1/players/nfl
node -e '
const fs=require("fs");
const raw=JSON.parse(fs.readFileSync("/tmp/players-raw.json","utf8"));
const out=[];
for (const p of Object.values(raw)) {
  if (!p || p.active !== true || !p.team || p.position === "DEF") continue;
  const n=(p.full_name||"").trim(); if(!n) continue;
  out.push({n, t: p.team==="OAK"?"LV":p.team, p: p.position||""});
}
out.sort((a,b)=>a.n.localeCompare(b.n)||a.t.localeCompare(b.t));
fs.writeFileSync("site/assets/data/players.json", JSON.stringify(out));
console.log(out.length, "players");
' # run from the repo root
```

Sanity checks after regenerating: count ~2,500–3,200; exactly 32 distinct `t` codes; "Patrick Mahomes" is `KC` / `QB`.
