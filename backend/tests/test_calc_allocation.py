"""Unit tests: the allocation ledger, on plain objects with no database."""
import random
import unittest
from datetime import datetime
from types import SimpleNamespace as NS

from tests import base  # noqa: F401  (pins the environment before app.* loads)
from app import calc


def item(id="it", packing=10, unit_value=100.0, unit_fob100=50.0):
    return NS(id=id, supplier_id="s", packing=packing, volume=0.1, unit_value=unit_value,
              value_mode="piece", unit_fob100=unit_fob100, fob_mode="100")


def line(id, po, date, boxes, item_id="it", packing=10, **prices):
    return NS(id=id, po=po, date=date, item_id=item_id, qty=boxes * packing, rbi=0, buyer_id="b",
              unit_value=prices.get("unit_value"), value_mode=None,
              unit_fob100=prices.get("unit_fob100"), fob_mode=None)


def invoice(no, date, boxes, pins=None, item_id="it", created=None):
    l = NS(item_id=item_id, supplier_id="s", boxes=boxes, po_alloc=pins)
    return NS(id=no, invoice_no=no, date=date, created_at=created or datetime(2026, 1, 1), lines=[l])


BOOK = [line("a", "PO1", "2026-01-01", 10), line("b", "PO2", "2026-02-01", 10), line("c", "PO3", "2026-03-01", 10)]


def ledger(invoices, book=BOOK, items=None):
    return calc.compute_ledger(book, invoices, items or {"it": item()})


def by_po(led, field="remaining", item_id="it"):
    out = {}
    for d in led[item_id]["demands"]:
        out[d["po"]] = out.get(d["po"], 0) + d[field]
    return out


class Fifo(unittest.TestCase):
    def test_oldest_first(self):
        self.assertEqual(by_po(ledger([invoice("A", "2026-04-01", 15)])), {"PO1": 0, "PO2": 5, "PO3": 10})

    def test_a_line_without_the_field_is_fifo(self):
        # An object from before the column: must read exactly as it always did.
        inv = invoice("A", "2026-04-01", 15)
        del inv.lines[0].po_alloc
        self.assertEqual(by_po(ledger([inv])), {"PO1": 0, "PO2": 5, "PO3": 10})

    def test_excess_is_reported_not_lost(self):
        led = ledger([invoice("A", "2026-04-01", 35)])
        self.assertEqual(by_po(led), {"PO1": 0, "PO2": 0, "PO3": 0})
        self.assertEqual(led["it"]["excess"], [{"invoice_no": "A", "date": "2026-04-01", "boxes": 5}])


class Pinned(unittest.TestCase):
    def test_boxes_go_to_the_named_order(self):
        led = ledger([invoice("A", "2026-04-01", 4, [{"po": "PO3", "boxes": 4}])])
        self.assertEqual(by_po(led), {"PO1": 10, "PO2": 10, "PO3": 6})

    def test_split_across_orders(self):
        led = ledger([invoice("A", "2026-04-01", 7, [{"po": "PO3", "boxes": 5}, {"po": "PO1", "boxes": 2}])])
        self.assertEqual(by_po(led), {"PO1": 8, "PO2": 10, "PO3": 5})
        self.assertEqual(calc.invoice_po_legs(led)["A"]["it"],
                         [{"po": "PO1", "date": "2026-01-01", "boxes": 2}, {"po": "PO3", "date": "2026-03-01", "boxes": 5}])

    def test_fifo_after_a_pin_walks_around_it(self):
        led = ledger([invoice("A", "2026-04-01", 10, [{"po": "PO1", "boxes": 10}]), invoice("B", "2026-05-01", 3)])
        self.assertEqual(by_po(led), {"PO1": 0, "PO2": 7, "PO3": 10})

    def test_backdated_fifo_cannot_take_a_pinned_box(self):
        led = ledger([invoice("A", "2026-04-01", 10, [{"po": "PO1", "boxes": 10}]), invoice("B", "2026-01-15", 5)])
        legs = calc.invoice_po_legs(led)
        self.assertEqual(legs["A"]["it"][0]["po"], "PO1")
        self.assertEqual(legs["A"]["it"][0]["boxes"], 10)
        self.assertEqual([x["po"] for x in legs["B"]["it"]], ["PO2"])

    def test_pinning_what_is_free_leaves_older_fifo_trails_alone(self):
        before = ledger([invoice("A", "2026-04-01", 15)])
        after = ledger([invoice("A", "2026-04-01", 15), invoice("B", "2026-05-01", 5, [{"po": "PO2", "boxes": 5}])])
        self.assertEqual(calc.invoice_po_legs(before)["A"], calc.invoice_po_legs(after)["A"])

    def test_pin_past_the_room_falls_through_to_fifo(self):
        # PO1's quantity was cut after the pin: nothing may vanish.
        book = [line("a", "PO1", "2026-01-01", 2), line("b", "PO2", "2026-02-01", 10)]
        led = ledger([invoice("A", "2026-04-01", 5, [{"po": "PO1", "boxes": 5}])], book)
        self.assertEqual(by_po(led), {"PO1": 0, "PO2": 7})

    def test_pin_to_a_deleted_order_falls_through_to_fifo(self):
        led = ledger([invoice("A", "2026-04-01", 5, [{"po": "GONE", "boxes": 5}])])
        self.assertEqual(by_po(led), {"PO1": 5, "PO2": 10, "PO3": 10})

    def test_pin_never_takes_more_than_the_line_packed(self):
        led = ledger([invoice("A", "2026-04-01", 3, [{"po": "PO1", "boxes": 9}])])
        self.assertEqual(by_po(led)["PO1"], 7)

    def test_trail_reads_oldest_invoice_first(self):
        # B is dated first but FIFO; A's pin is handed out first. The trail still
        # reads in the order the boxes arrived.
        led = ledger([invoice("A", "2026-04-01", 2, [{"po": "PO1", "boxes": 2}]), invoice("B", "2026-01-15", 1)])
        po1 = next(d for d in led["it"]["demands"] if d["po"] == "PO1")
        self.assertEqual(list(po1["cleared"]), ["B", "A"])

    def test_same_item_twice_on_one_order(self):
        book = [line("a", "PO1", "2026-01-01", 3), line("b", "PO1", "2026-01-01", 3)]
        led = ledger([invoice("A", "2026-04-01", 5, [{"po": "PO1", "boxes": 5}])], book)
        self.assertEqual(by_po(led), {"PO1": 1})
        self.assertEqual(calc.open_by_po(led, ["it"])["it"][0]["open"], 1)


class Invariants(unittest.TestCase):
    """Whatever the mix of invoices: every box is accounted for exactly once."""

    def test_random_books(self):
        for seed in range(300):
            r = random.Random(seed)
            book = [line(f"l{i}", f"PO{r.randint(1, 5)}", f"2026-0{r.randint(1, 9)}-01", r.randint(1, 20)) for i in range(r.randint(1, 8))]
            pos = sorted({x.po for x in book})
            invs = []
            for i in range(r.randint(0, 8)):
                boxes = r.randint(0, 25)
                pins = None
                if r.random() < 0.5:
                    pins = [{"po": r.choice(pos + ["GONE"]), "boxes": r.randint(0, boxes)} for _ in range(r.randint(1, 3))]
                invs.append(invoice(f"N{i}", f"2026-0{r.randint(1, 9)}-15", boxes, pins))
            r.shuffle(invs)
            led = ledger(invs, book)
            ds = led["it"]["demands"]
            packed = sum(i.lines[0].boxes for i in invs)
            cleared = sum(sum(d["cleared"].values()) for d in ds)
            excess = sum(e["boxes"] for e in led["it"]["excess"])
            with self.subTest(seed=seed):
                self.assertEqual(cleared + excess, packed)
                for d in ds:
                    self.assertGreaterEqual(d["remaining"], 0)
                    self.assertEqual(d["allocated"] + d["remaining"], d["ordered"])
                    self.assertEqual(sum(d["cleared"].values()), d["allocated"])
                # Excess only exists once every order is full.
                if excess:
                    self.assertEqual(sum(d["remaining"] for d in ds), 0)
                # The answer does not depend on the order the rows came back in.
                r.shuffle(invs)
                self.assertEqual([d["cleared"] for d in ledger(invs, book)["it"]["demands"]], [d["cleared"] for d in ds])


class Prices(unittest.TestCase):
    BOOK = [line("a", "PO1", "2026-01-01", 10, unit_value=100.0, unit_fob100=40.0),
            line("b", "PO2", "2026-02-01", 10, unit_value=200.0, unit_fob100=80.0)]

    def open(self, invs=()):
        return calc.open_demands_by_item(self.BOOK, list(invs), {"it": item()})["it"]

    def test_pinned_line_takes_the_named_orders_price(self):
        d = calc.pinned_demands(self.open(), [{"po": "PO2", "boxes": 5}])
        self.assertEqual(calc.invoiced_prices(item(), 5, d)["unit_value"], 200.0)

    def test_split_is_weighted_by_boxes(self):
        d = calc.pinned_demands(self.open(), [{"po": "PO1", "boxes": 5}, {"po": "PO2", "boxes": 15}])
        # PO2 only has 10: the demand is capped at what it holds.
        self.assertEqual([x["remaining"] for x in d], [5, 10])
        self.assertAlmostEqual(calc.invoiced_prices(item(), 15, d)["unit_value"], (5 * 100 + 10 * 200) / 15)

    def test_fifo_price_is_unchanged(self):
        self.assertEqual(calc.invoiced_prices(item(), 5, self.open())["unit_value"], 100.0)

    def test_open_by_po_lists_only_what_is_asked_and_open(self):
        led = calc.compute_ledger(self.BOOK, [invoice("A", "2026-04-01", 10, [{"po": "PO1", "boxes": 10}])], {"it": item(), "other": item("other")})
        out = calc.open_by_po(led, ["it", "other", "unknown"])
        self.assertEqual([x["po"] for x in out["it"]], ["PO2"])
        self.assertEqual(out["other"], [])
        self.assertEqual(out["unknown"], [])


if __name__ == "__main__":
    unittest.main()
