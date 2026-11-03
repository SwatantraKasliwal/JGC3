import { useMemo } from "react";
import { useItems, useOptions, useSuppliers } from "../api/hooks.js";
import { blockOf, blockHeads } from "./sequence.js";

/* The block headings for a list already in the item sequence — the API's
   lists come sorted that way. One entry per row: the heading that row opens
   (Oswin, then Oswin · PMF …, from Setup → Item groups) or null. A list that
   is all one block gets no headings. Feed it to DataTable's `section`.

   Rows name their item by id (`item_id` unless `itemId` says otherwise); the
   item itself comes from the master, which carries the range and GD code a
   block is decided by. */
export function useBlockHeads(rows, { itemId = (r) => r.item_id, supplierOf = (r) => r.supplier_id } = {}) {
  const items = useItems().data;
  const suppliers = useSuppliers().data;
  const groups = useOptions().data?.item_groups;
  return useMemo(() => {
    const byId = Object.fromEntries((items || []).map((i) => [i.id, i]));
    return blockHeads(rows || [], blockOf({
      suppliers: suppliers || [], groups, getItem: (r) => byId[itemId(r)] || r, supplierOf,
    }));
  }, [rows, items, suppliers, groups]); // eslint-disable-line react-hooks/exhaustive-deps
}
