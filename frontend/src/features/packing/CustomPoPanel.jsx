import { useMemo } from "react";
import { ListChecks, AlertTriangle } from "lucide-react";
import {
  Card, CardHead, DataTable, Mono, Note, NumberInput, Pill, Spinner, Step, ErrorState,
} from "../../components/ui/index.jsx";
import { useBuyers } from "../../api/hooks.js";
import { dmy } from "../../lib/format.js";
import { eligiblePos } from "../../lib/poAlloc.js";

/* Custom PO: tick the orders these boxes come off.

   Only orders holding something that was entered are listed, so four open
   orders of which two hold the items read as two choices. Each item then fills
   the ticked orders oldest first; retyping a figure splits it by hand. */
export default function CustomPoPanel({ n, rows, query, picked, onPicked, manual, onManual, place, buyerId }) {
  const buyers = useBuyers().data || [];
  const open = query.data;
  const pos = useMemo(() => eligiblePos(rows, open), [rows, open]);
  const ticked = pos.filter((p) => picked.includes(p.po));

  const toggle = (po) => {
    if (picked.includes(po)) {
      onPicked(picked.filter((x) => x !== po));
      // A hand split that used this order no longer adds up; fill it afresh.
      onManual(Object.fromEntries(Object.entries(manual).filter(([, cells]) => !cells[po])));
    } else {
      onPicked([...picked, po]);
    }
  };
  const setCell = (itemId, po, val, max) => onManual({
    ...manual,
    [itemId]: { ...(place.byItem[itemId]?.cells || {}), [po]: Math.min(Number(val) || 0, max) },
  });

  return (
    <section>
      <Step n={n} title="Which purchase orders do these boxes come off?"
        hint="Only the orders holding the items you entered are listed. Tick the ones to deduct from: each item fills them oldest first, and you can retype any figure to split it yourself." />
      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} title="Could not read the open orders" />
        : !open || (!pos.length && rows.some((r) => !open[r.item_id])) ? <Spinner label="Finding the orders that hold these items…" />
          : !pos.length ? (
            <Note tone="amber" icon={AlertTriangle}>No open purchase order holds these items, so there is nothing to choose — they will be recorded as beyond what is on order.</Note>
          ) : (
            <div className="stack-sm">
              <Card>
                <CardHead icon={ListChecks} title={`${pos.length} order${pos.length === 1 ? "" : "s"} hold${pos.length === 1 ? "s" : ""} these items`} />
                <div className="po-opts">
                  {pos.map((p) => {
                    const on = picked.includes(p.po);
                    const other = buyerId && p.buyer_id && p.buyer_id !== buyerId;
                    return (
                      <label key={p.po} className={`po-opt${on ? " on" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(p.po)} aria-label={`Deduct from PO ${p.po}`} />
                        <span>
                          <span className="row wrap" style={{ gap: 6 }}>
                            <Mono>PO {p.po}</Mono>
                            {other ? <Pill tone="amber">{buyers.find((b) => b.id === p.buyer_id)?.brand || "another buyer"}</Pill> : null}
                          </span>
                          <span className="po-opt-sub">{dmy(p.date)} · {p.items} of {rows.length} item{rows.length === 1 ? "" : "s"} · {p.boxes} box{p.boxes === 1 ? "" : "es"} open</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Card>
              {ticked.length > 0 && (
                <Card>
                  <DataTable serial freeze={1}
                    columns={[
                      { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                      { key: "desc", label: "Description", render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
                      { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                      ...ticked.map((p) => ({
                        key: `po:${p.po}`, label: `PO ${p.po}`, align: "r",
                        render: (r) => {
                          const leg = (open[r.item_id] || []).find((o) => o.po === p.po);
                          if (!leg) return <span style={{ color: "var(--faint)" }}>—</span>;
                          return (
                            <span className="po-cell">
                              <NumberInput className="input-sm num-in" style={{ width: 80 }} placeholder="0"
                                aria-label={`Boxes of ${r.gd} from PO ${p.po}`}
                                value={place.byItem[r.item_id]?.cells[p.po] ?? ""}
                                onChange={(v) => setCell(r.item_id, p.po, v, leg.open)} />
                              <small>of {leg.open}</small>
                            </span>
                          );
                        },
                      })),
                      {
                        key: "state", label: "", align: "r",
                        render: (r) => {
                          const s = place.byItem[r.item_id] || {};
                          if (!s.known) return <span style={{ color: "var(--faint)" }}>…</span>;
                          if (s.short > 0) return <Pill tone="amber">{s.short} to place</Pill>;
                          if (s.short < 0) return <Pill tone="amber">{-s.short} too many</Pill>;
                          if (s.spare > 0) return <Pill tone="amber">{s.spare} beyond orders</Pill>;
                          return <Pill tone="green">placed</Pill>;
                        },
                      },
                    ]}
                    rows={rows} rowKey={(r) => r.item_id}
                  />
                </Card>
              )}
              {place.short > 0 && (
                <Note tone="amber" icon={AlertTriangle}>
                  {ticked.length
                    ? <><b>{place.short}</b> box{place.short === 1 ? "" : "es"} still need an order — tick another, or lower the boxes.</>
                    : <>Tick the orders to deduct these boxes from.</>}
                </Note>
              )}
            </div>
          )}
    </section>
  );
}
