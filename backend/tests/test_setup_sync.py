"""Integration tests: what Setup changes reaches what uses it."""
from tests.base import ApiCase
from app import models, options
from app.database import SessionLocal, engine


class Lists(ApiCase):
    def save(self, key, values, renames=None):
        return self.ok(self.client.put(f"/api/options/list/{key}", json={"values": values, "renames": renames or {}}))

    def opts(self):
        return self.ok(self.client.get("/api/options"))

    def buyer_now(self):
        return next(b for b in self.ok(self.client.get("/api/buyers")) if b["id"] == self.buyer["id"])

    def set_ports(self, *ports):
        self.ok(self.client.put(f"/api/buyers/{self.buyer['id']}", json={"ports": list(ports), "ship_to": ports[0] if ports else ""}))

    def test_a_port_added_is_on_the_list_at_once(self):
        self.save("ports_ship_to", ["FREMANTLE"])
        self.save("ports_ship_to", ["FREMANTLE", "MELBOURNE"])
        self.assertEqual(self.opts()["ports_ship_to"], ["FREMANTLE", "MELBOURNE"])

    def test_renaming_a_port_follows_onto_buyers(self):
        self.save("ports_ship_to", ["FREMANTLE", "MELBOURNE"])
        self.set_ports("FREMANTLE", "MELBOURNE")
        self.save("ports_ship_to", ["FREMANTLE (AU)", "MELBOURNE"], {"FREMANTLE": "FREMANTLE (AU)"})
        b = self.buyer_now()
        self.assertEqual(b["ports"], ["FREMANTLE (AU)", "MELBOURNE"])
        self.assertEqual(b["ship_to"], "FREMANTLE (AU)")

    def test_removing_a_port_takes_it_off_buyers(self):
        self.save("ports_ship_to", ["FREMANTLE", "MELBOURNE"])
        self.set_ports("FREMANTLE", "MELBOURNE")
        self.save("ports_ship_to", ["MELBOURNE"])
        b = self.buyer_now()
        self.assertEqual(b["ports"], ["MELBOURNE"])
        self.assertEqual(b["ship_to"], "MELBOURNE")

    def test_removing_a_buyers_only_port_keeps_what_the_papers_print(self):
        self.save("ports_ship_to", ["FREMANTLE"])
        self.set_ports("FREMANTLE")
        self.save("ports_ship_to", [])
        b = self.buyer_now()
        self.assertEqual(b["ports"], [])
        self.assertEqual(b["ship_to"], "FREMANTLE")

    def test_adding_a_port_leaves_buyers_alone(self):
        self.save("ports_ship_to", ["FREMANTLE"])
        self.set_ports("FREMANTLE")
        self.save("ports_ship_to", ["FREMANTLE", "MELBOURNE"])
        self.assertEqual(self.buyer_now()["ports"], ["FREMANTLE"])

    def test_rename_of_a_term_reaches_open_invoices_not_shipped_ones(self):
        self.save("terms_delivery", ["FOB MUMBA"])
        open_inv = self.record("OPEN", {1: 1})
        shipped = self.record("SHIP", {2: 1})
        self.ok(self.client.put(f"/api/invoices/{open_inv['id']}", json={"ship": {"terms": "FOB MUMBA"}}))
        self.ok(self.client.put(f"/api/invoices/{shipped['id']}", json={
            "ship": {"terms": "FOB MUMBA", "container": "C", "seal": "S", "blNo": "B", "blDate": "2026-06-01", "vessel": "V"},
            "step_skip": {"vehicle": True}}))
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{shipped['id']}"))["status"], "Shipped")
        self.save("terms_delivery", ["FOB MUMBAI"], {"FOB MUMBA": "FOB MUMBAI"})
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{open_inv['id']}"))["ship"]["terms"], "FOB MUMBAI")
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{shipped['id']}"))["ship"]["terms"], "FOB MUMBA")

    def test_renaming_a_port_reaches_the_open_invoice_too(self):
        self.save("ports_ship_to", ["FREMANTLE"])
        inv = self.record("OPEN", {1: 1})
        self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"ship": {"pod": "FREMANTLE"}}))
        self.save("ports_ship_to", ["PERTH"], {"FREMANTLE": "PERTH"})
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{inv['id']}"))["ship"]["pod"], "PERTH")

    def test_rename_of_a_packaging_type_reaches_items(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"packaging_type": "Bundel"}))
        self.save("packaging_types", ["Cartons", "Bundel"])
        self.save("packaging_types", ["Cartons", "Bundle"], {"Bundel": "Bundle"})
        it = next(x for x in self.ok(self.client.get("/api/items")) if x["id"] == self.i[1])
        self.assertEqual(it["packaging_type"], "Bundle")

    def test_a_rename_to_nothing_on_the_list_is_ignored(self):
        self.save("ports_ship_to", ["A"])
        self.set_ports("A")
        self.save("ports_ship_to", ["A"], {"A": "NOT ON THE LIST"})
        self.assertEqual(self.buyer_now()["ports"], ["A"])

    def test_unsaved_list_is_read_off_what_is_in_use(self):
        self.set_ports("DERBY")
        self.assertIn("DERBY", self.opts()["ports_ship_to"])

    def test_case_only_correction(self):
        self.save("ports_ship_to", ["fremantle"])
        self.set_ports("fremantle")
        self.save("ports_ship_to", ["FREMANTLE"], {"fremantle": "FREMANTLE"})
        # The case-insensitive compare must not read this as "nothing changed".
        self.assertEqual(self.opts()["ports_ship_to"], ["FREMANTLE"])
        self.assertEqual(self.buyer_now()["ports"], ["FREMANTLE"])


class Banks(ApiCase):
    BANK = {"bank_name": "HDFC Bank", "account_no": "123456", "confirm_account_no": "123456",
            "ifsc": "HDFC0000123", "branch": "Ghatkopar", "city": "Mumbai", "state": "Maharashtra"}

    def test_correction_reaches_open_invoices_only(self):
        bank = self.ok(self.client.post("/api/options/banks", json=self.BANK), 201)
        ship = {"bankId": bank["id"], **options.bank_lines(bank)}
        a = self.record("OPEN", {1: 1})
        b = self.record("SHIP", {2: 1})
        self.ok(self.client.put(f"/api/invoices/{a['id']}", json={"ship": ship}))
        self.ok(self.client.put(f"/api/invoices/{b['id']}", json={
            "ship": {**ship, "container": "C", "seal": "S", "blNo": "B", "blDate": "2026-06-01", "vessel": "V"},
            "step_skip": {"vehicle": True}}))
        self.ok(self.client.put(f"/api/options/banks/{bank['id']}", json={**self.BANK, "branch": "Andheri", "ifsc": "HDFC0000999", "confirm_account_no": None}))
        now = self.ok(self.client.get(f"/api/invoices/{a['id']}"))["ship"]
        self.assertEqual(now["bank"], "HDFC Bank, Andheri BRANCH")
        self.assertEqual(now["bankIfsc"], "HDFC0000999")
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{b['id']}"))["ship"]["bank"], "HDFC Bank, Ghatkopar BRANCH")

    def test_bank_lines_match_the_browser(self):
        # The same cases as bankLines in ShipTermsFields.jsx (scripts/test-unit.mjs).
        self.assertEqual(options.bank_lines({"bank_name": "HDFC Bank", "branch": "Ghatkopar Branch", "city": "Mumbai", "state": "MH", "account_no": "9", "ifsc": "I"}),
                         {"bank": "HDFC Bank, Ghatkopar Branch", "bankAddr": "Ghatkopar, Mumbai, MH (INDIA)", "bankAccount": "9", "bankIfsc": "I"})
        self.assertEqual(options.bank_lines({"bank_name": "SBI"}),
                         {"bank": "SBI", "bankAddr": "", "bankAccount": "", "bankIfsc": ""})


class Migration(ApiCase):
    def test_an_old_database_gains_the_columns_and_keeps_its_invoices(self):
        from sqlalchemy import inspect, text
        from app.migrate import run_migrations
        inv = self.record("OLD", {1: 25})
        with engine.begin() as c:
            c.execute(text("ALTER TABLE invoices DROP COLUMN allocation"))
            c.execute(text("ALTER TABLE invoice_lines DROP COLUMN po_alloc"))
        # A boot starts on fresh connections. SQLite's pooled ones would keep the
        # old schema in memory and misreport the ALTER — the test's doing, not a boot's.
        engine.dispose()
        self.assertNotIn("po_alloc", {x["name"] for x in inspect(engine).get_columns("invoice_lines")})
        applied = run_migrations()
        self.assertIn("invoices.allocation", applied)
        self.assertIn("invoice_lines.po_alloc", applied)
        self.assertEqual(run_migrations(), [])                                    # a second boot does nothing
        fresh = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        self.assertEqual(fresh["allocation"], "fifo")
        self.assertIsNone(fresh["lines"][0]["po_alloc"])
        self.assertEqual(self.legs(inv, 1), {"PO1": 20, "PO2": 5})

    def test_fifo_lines_store_a_real_null(self):
        # _repoint_pins filters on IS NOT NULL; a JSON 'null' would be read as a pin.
        self.record("F1", {1: 1})
        db = SessionLocal()
        try:
            self.assertEqual(db.query(models.InvoiceLine).filter(models.InvoiceLine.po_alloc.isnot(None)).count(), 0)
        finally:
            db.close()
