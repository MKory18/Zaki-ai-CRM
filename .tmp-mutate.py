import io, subprocess, hashlib

LIB = 'src/lib/tracking-priority.ts'
SCR = 'src/components/screens/TrackingScreen.tsx'
orig = {p: io.open(p, 'rb').read() for p in (LIB, SCR)}
hashes = {p: hashlib.sha256(b).hexdigest() for p, b in orig.items()}
text = {p: b.decode('utf-8') for p, b in orig.items()}

M = [
 (LIB, "rank: a cancelled parcel no longer outranks a failed delivery",
  "  CANCELLED: {\n    rank: 0,", "  CANCELLED: {\n    rank: 3.5,"),
 (LIB, "rank: a data change sinks below lateness",
  "  CHANGED: {\n    rank: 1,", "  CHANGED: {\n    rank: 4.5,"),
 (LIB, "rank: two conditions share a place",
  "  FAILED: {\n    rank: 2,", "  FAILED: {\n    rank: 1,"),
 (LIB, "rank: NONE no longer sorts last",
  "  NONE: {\n    rank: 7,", "  NONE: {\n    rank: -1,"),
 (LIB, "alert: an acknowledged alert shouts again",
  "  !!row.alert && row.alert.kind === kind && !row.alert.acknowledged;",
  "  !!row.alert && row.alert.kind === kind;"),
 (LIB, "NO_BARCODE: a parcel not yet picked up counted as shipped without one",
  "  NO_BARCODE: (row) => !row.trackingNumber && row.shippingStatus !== 'READY_FOR_PICKUP',",
  "  NO_BARCODE: (row) => !row.trackingNumber,"),
 (LIB, "COLLECT: a partial delivery no longer owes money",
  "    ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(row.shippingStatus) && row.settlementStatus !== 'SETTLED',",
  "    ['DELIVERED'].includes(row.shippingStatus) && row.settlementStatus !== 'SETTLED',"),
 (LIB, "COLLECT: a settled parcel asked for money twice",
  "  COLLECT: (row) =>\n    ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(row.shippingStatus) && row.settlementStatus !== 'SETTLED',",
  "  COLLECT: (row) =>\n    ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(row.shippingStatus),"),
 (LIB, "LATE: inverted",
  "  LATE: (row) => row.late,", "  LATE: (row) => !row.late,"),
 (LIB, "canCollect: no longer the same function as the rank's",
  "export const canCollect = MATCHES.COLLECT;",
  "export const canCollect = (row: TrackingFacts) => MATCHES.COLLECT(row);"),
 (LIB, "NONE: given a label, so a quiet row wears a chip",
  "  NONE: {\n    rank: 7,\n    label: '',", "  NONE: {\n    rank: 7,\n    label: 'لا شيء',"),
 (LIB, "COLLECT: painted as a fault instead of cash waiting",
  "    why: 'سُلّمت ولم تُسوَّ — مبلغها ما زال عند جهة الشحن.',\n    tone: 'good',",
  "    why: 'سُلّمت ولم تُسوَّ — مبلغها ما زال عند جهة الشحن.',\n    tone: 'bad',"),
 (LIB, "rank order: the LEAST urgent match wins",
  "  (a, b) => URGENCY[a].rank - URGENCY[b].rank\n);",
  "  (a, b) => URGENCY[b].rank - URGENCY[a].rank\n);"),
 (LIB, "sort: newest first instead of longest waiting",
  "  return db - da;", "  return da - db;"),
 (LIB, "sort: a parcel that never shipped heads the queue",
  "  if (da === null) return 1;\n  if (db === null) return -1;",
  "  if (da === null) return -1;\n  if (db === null) return 1;"),
 (LIB, "sort: rank ignored, only the clock",
  "  const byRank = URGENCY[trackingUrgency(a)].rank - URGENCY[trackingUrgency(b)].rank;\n  if (byRank !== 0) return byRank;",
  "  const byRank = 0;\n  if (byRank !== 0) return byRank;"),
 (SCR, "screen: the barcode line comes back to the phone",
  "      // The «بلا باركود» chip is how the missing ones are found.\n              hideOnPhone: true,",
  "      // The «بلا باركود» chip is how the missing ones are found.\n              "),
 (SCR, "screen: the attempts line comes back to the phone",
  "      // reads «0» on every card is a line nobody reads twice.\n              hideOnPhone: true,",
  "      // reads «0» on every card is a line nobody reads twice.\n              "),
 (SCR, "screen: the contact column stops being full width on the card",
  '              <div className="w-full md:hidden">\n                <ContactButtons {...contactFor(o)} />',
  '              <div className="md:hidden">\n                <ContactButtons {...contactFor(o)} />'),
 (SCR, "screen: the red tint goes back to meaning lateness",
  "          alert={(o) => !!o.alert && !o.alert.acknowledged}",
  "          alert={(o) => o.late}"),
 (SCR, "screen: the list goes back to arrival order",
  ".slice().sort(byUrgency);", ".slice();"),
 (SCR, "screen: the alert loses its place at the top of the card",
  "          notice={(o) =>", "          notMyNotice={(o) =>"),
 (SCR, "screen: «استلم» shrinks below a thumb",
  'className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--sys-success)]/40',
  'className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--sys-success)]/40'),
]

caught = 0
for path, name, old, new in M:
    if text[path].count(old) != 1:
        print("SKIP (anchor %d hits): %s" % (text[path].count(old), name)); continue
    io.open(path, 'w', encoding='utf-8', newline='').write(text[path].replace(old, new))
    r = subprocess.run(['npx','vitest','run','src/lib/tracking-priority.test.ts','--reporter=dot'],
                       capture_output=True, shell=True)
    failed = r.returncode != 0
    caught += 1 if failed else 0
    print("%s %s" % ("CAUGHT  " if failed else "SURVIVED", name))
    io.open(path, 'wb').write(orig[path])

print("\n%d/%d caught" % (caught, len(M)))
for p in (LIB, SCR):
    print("restored byte-identical %s: %s" % (p, hashlib.sha256(io.open(p,'rb').read()).hexdigest() == hashes[p]))
