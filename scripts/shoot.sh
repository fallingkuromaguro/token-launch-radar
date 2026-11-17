#!/bin/sh
# Take the three dashboard screenshots with headless Chrome from a built output directory.
# Usage: scripts/shoot.sh <output-dir> <chrome-binary>   (run after main.ts has written <output-dir>)
# The page is served on 127.0.0.1 only; no outside address is contacted.
set -e
OUT="$1"; CHROME="$2"; PORT=8765
[ -d "$OUT/dashboard" ] || { echo "no $OUT/dashboard" >&2; exit 2; }
SLUG=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).rows; const w=r.find(x=>x.watchlist); process.stdout.write(w.slug)' "$OUT/board.json")
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$OUT" >/dev/null 2>&1 &
SERVER=$!
sleep 1
mkdir -p screenshots
shot() {
  "$CHROME" --headless=new --no-sandbox --disable-gpu --no-proxy-server --hide-scrollbars \
    --window-size=1440,900 --virtual-time-budget=5000 --screenshot="$1" "http://127.0.0.1:$PORT/dashboard/index.html$2" >/dev/null 2>&1
}
shot "screenshots/1-board.png" "#/board"
shot "screenshots/2-detail.png" "#/p/$SLUG"
shot "screenshots/3-filtered.png" "#/board?cat=Lending&w=1"
kill "$SERVER" 2>/dev/null || true
ls -la screenshots
