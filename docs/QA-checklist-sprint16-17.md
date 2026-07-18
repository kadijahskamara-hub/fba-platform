# QA Checklist — Sprints 16 & 17

Production deployment `3c38d09` (READY). Both sprints are live.

Work through in order — Part A confirms the backend is in the state the
frontend tests assume, Part B drives the UI, Part C is regression.

**Login:** admin/Ultra account. Some steps need a *client* account too
(marked CLIENT) — use a second browser profile or a private window.

---

## Part A — Backend checks (Supabase SQL editor, read-only)

Project: `Full-Bloom-Artelier-Platform` (`qnuqvdzguesetnevhsoc`)
→ Dashboard → SQL Editor. None of these write anything.

### A1. Party guard is live on allocate_payment

```sql
select prosrc like '%party_mismatch%' as guard_present
from pg_proc where proname = 'allocate_payment';
```
- [ ] Returns `true`

### A2. Starting state — unallocated confirmed payments

```sql
select p.payment_reference, p.status, p.amount,
       coalesce(sum(pa.amount),0) as allocated,
       p.amount - coalesce(sum(pa.amount),0) as unallocated
from payments p
left join payment_allocations pa on pa.payment_id = p.id
where p.status = 'confirmed'
group by p.id, p.payment_reference, p.status, p.amount;
```
- [ ] Note the references and amounts — you'll match these in the UI

### A3. Invoice starting figures

```sql
select invoice_number, status, gross_total, amount_paid, balance_due,
       (locked_at is not null) as issued
from sales_invoices order by created_at desc;
```
- [ ] Record `amount_paid` / `balance_due` before you allocate

### A4. Storage bucket exists (context for Bug 1)

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'custom-match';
```
- [ ] Row exists, `public = false` — confirms the bucket is NOT the cause

---

## Part B — Frontend tests

### B1. Payment allocation appears at all  *(the original bug)*

1. Go to **Admin → Payments**
2. Open a **confirmed** payment with an unallocated balance (from A2)
3. Check:
   - [ ] Button reads **"Allocate to invoice (£X unallocated)"** — before the fix there was no control at all
   - [ ] Click it — a panel lists candidate invoices with Due date and Balance
   - [ ] Invoices for the same client **or** the same commercial order appear

### B2. Partial allocation

1. In that panel, enter an amount **smaller** than the payment balance (e.g. `110`)
2. Click **Save allocation**
3. Check on the payment page:
   - [ ] Allocated / Unallocated stat cards updated
   - [ ] An "Applied to: INV… · £110.00" chip appears
4. Open the invoice:
   - [ ] **Paid** increased by the same amount
   - [ ] **Balance due** decreased by the same amount
   - [ ] Status now `partially paid`

### B3. Split one payment across two invoices

*Needs two issued invoices with balances for the same client/order.*

1. Open the panel, enter an amount against **two different** invoices
2. Watch the running total: "£X of £Y · £Z left"
3. Save
   - [ ] Both invoices update independently
   - [ ] Payment unallocated reduces by the combined total
   - [ ] Each invoice shows only **its own** share as Paid

### B4. Validation — these must be REFUSED

- [ ] Enter more than the payment's unallocated balance → counter turns red ("over by £X"), **Save is disabled**
- [ ] Enter more than an invoice's outstanding balance → server error: *"Allocation exceeds the invoice outstanding balance…"*
- [ ] Use the **max** link → fills the lower of (payment unallocated, invoice balance)

### B5. Un-allocate

1. Click the **×** on an "Applied to" chip, confirm
   - [ ] Payment unallocated goes back up
   - [ ] Invoice Paid / Balance due revert
   - [ ] Invoice status reverts (e.g. `paid` → `partially paid` → `issued`)

### B6. Apply payment from the INVOICE side

1. Open an **issued** invoice with a balance
2. Find the **Payment** panel → **Apply payment**
   - [ ] Dropdown lists confirmed payments with unallocated money
   - [ ] **"Use £X"** fills the capped amount
   - [ ] Apply → both sides update

### B7. Figures agree everywhere

After allocating, confirm the same numbers show on:
- [ ] Payment detail
- [ ] Invoice detail
- [ ] **Admin → Invoices** list (Paid column — was £0.00 on every row)
- [ ] Commercial order → **Billing** panel
- [ ] **Admin → Operations** → Workload & Open Items

### B8. Empty states explain themselves

- [ ] Open a **pending** (unconfirmed) payment → message: *"Only confirmed payments can be allocated."*
- [ ] Open a confirmed payment whose only invoice is still **draft** → *"…must be issued before payment can be allocated to it."* (this is the £9,792 case — correct behaviour, not a bug)

### B9. Reconciliation report no longer contradicts Operations

1. **Admin → Accounting → Reports → Reconciliation exceptions**
   - [ ] Unallocated confirmed payments are now **listed** (previously said "No exceptions — everything reconciles")
   - [ ] Rows read `payment_unallocated` or `payment_part_allocated` with the amount
2. Compare against **Operations → Workload & Open Items**
   - [ ] The two lists agree on which payments are outstanding
3. Allocate a payment fully, reload the report
   - [ ] It disappears from both

---

### B10. Quote Pipeline project name  *(Sprint 17, Bug 2)*

**Must be a NEW request — existing rows were not backfilled.**

1. CLIENT: **Account → Projects** → open or create a project with a clear name
   (e.g. `TEST — Sprint 17 QA Project`)
2. CLIENT: add at least one product to it (Save to Project from a product page)
3. CLIENT: click **Request quote for all items** → confirm
4. ADMIN: **Admin → Quotes → Quote Pipeline**
   - [ ] The new request shows the **real project name**, not "Untitled"
5. Backend confirm:
```sql
select project_id, project_name, project_location, status
from quote_requests order by created_at desc limit 3;
```
   - [ ] Newest row has `project_name` populated (older rows staying null is expected)

### B11. Quote line Fabric / Full specification  *(Sprint 17, Bug 3)*

**Also only applies to requests created after the deploy.**
Best signal: use a product configured with **both** a hard finish group
(timber/metal/stone) and a soft one (fabric/upholstery/leather).

1. Convert the B10 request into a quote/proforma
2. Open the quote → expand a line → **Details**
   - [ ] **Finish** shows the hard finishes only
   - [ ] **Fabric / upholstery** shows the soft finish (was blank)
   - [ ] **Full specification** lists every selection, one per line (was blank)
3. Issue the quote and open the PDF
   - [ ] Finish and Fabric both render
   - [ ] No duplicated or garbled spec block

> If the product has no fabric/upholstery group, Fabric staying blank is
> correct — check Full specification is populated instead.

### B12. Custom Match attachments  *(Sprint 17, Bug 1 — DIAGNOSTIC)*

**This one is expected to possibly still fail.** The root cause was never
confirmed; what changed is that the failure now reports its reason.
The goal of this test is to capture that reason.

1. Open any published product page → launch **Custom Match**
2. Complete the form, attach **one PDF and one image**
3. Submit, then read the message under the attachment area:
   - [ ] **If it says "2 files attached."** → the bug is resolved; continue to step 4
   - [ ] **If it names each file with a reason** (e.g. `sample.pdf: Attachment storage is not configured…`) → **copy that text exactly and send it to Claude**
4. ADMIN: **Admin → Custom Match** → open the new FBA-CM request
   - [ ] Attachments section lists both files
   - [ ] Each downloads and opens correctly

Optional — capture the server-side detail while logs are live (short retention,
so run within minutes of the test):
```powershell
vercel ls --scope kadijahta-fba-s-projects
# take the newest production URL, then:
vercel logs <that-url> --scope kadijahta-fba-s-projects
```
Look for a line starting `custom-match attachment upload failed:` — it carries
the real Supabase error, bucket, path, filename, mime type and size.

---

## Part C — Regression (things the changes could have broken)

### C1. Standalone quote form still keeps a typed project name
1. CLIENT (or logged out where allowed): go to **/quote**
2. Type a project name and location, submit
   - [ ] Admin → Quote Pipeline shows the **typed** name (client input must still win over the project fallback)

### C2. Non-project quote requests
- [ ] Request a quote from a product/cart without a project → still creates a request, no crash

### C3. Payment functions untouched by the allocation work
- [ ] **Issue receipt** on a confirmed payment still works
- [ ] **Reverse** a payment → allocations are removed and invoice figures revert
- [ ] **Refund** controls still load on payment detail

### C4. Credit notes / voids still behave with allocations present
- [ ] Raise a credit note against a partially-paid invoice → balance reflects both payment and credit
- [ ] Voiding an invoice **with** a payment allocated is still blocked

### C5. Existing Custom Match flow
- [ ] Submitting **without** attachments still succeeds and returns an FBA-CM reference
- [ ] Convert-to-quote from a Custom Match request still works

---

## Reporting back

For anything that fails, capture:
1. The exact on-screen message
2. What you did immediately before
3. The record reference (FBA-INV-…, FBA-PAY-…, FBA-CM-…)

Highest priority is **B12** — that message is what closes Bug 1.
