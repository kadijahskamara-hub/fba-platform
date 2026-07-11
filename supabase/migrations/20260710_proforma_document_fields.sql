-- ============================================================
-- FBA Platform — Proforma & Invoice document redesign
-- 1) Document-level fields (VAT, deposit, lead time, delivery,
--    payment terms, invoice identity) on proformas
-- 2) Presentation fields (section, spec details, image) on lines
-- 3) proforma_sends → proforma_downloads (email delivery removed;
--    documents are now downloaded and attached manually)
-- 4) Seed document settings (company/payment details + T&Cs)
-- ============================================================

-- 1. Proforma document fields ---------------------------------
ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS vat_rate         numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS deposit_percent  numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS lead_time        text,
  ADD COLUMN IF NOT EXISTS delivery_notes   text,
  ADD COLUMN IF NOT EXISTS payment_terms    text,
  ADD COLUMN IF NOT EXISTS invoice_number   text,
  ADD COLUMN IF NOT EXISTS invoice_date     date,
  ADD COLUMN IF NOT EXISTS invoice_due_date date;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

-- 2. Line item presentation fields ----------------------------
ALTER TABLE proforma_line_items
  ADD COLUMN IF NOT EXISTS section      text,
  ADD COLUMN IF NOT EXISTS spec_details text,
  ADD COLUMN IF NOT EXISTS image_url    text;

-- 3. Send log becomes download log ----------------------------
ALTER TABLE proforma_sends RENAME TO proforma_downloads;
ALTER TABLE proforma_downloads RENAME COLUMN send_type TO audience;
ALTER TABLE proforma_downloads RENAME COLUMN sent_by  TO downloaded_by;
ALTER TABLE proforma_downloads RENAME COLUMN sent_at  TO downloaded_at;
ALTER TABLE proforma_downloads
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'proforma';

COMMENT ON TABLE proforma_downloads IS
  'Log of document downloads (client / manufacturer copies). Replaces the old email send log.';

-- 4. Seed document settings (edit via /api/admin/site-settings)
INSERT INTO site_settings (key, value) VALUES (
  'document_settings',
  '{
    "company_name":     "Full Bloom Artelier",
    "tagline":          "Design Procurement Studio, London",
    "email":            "info@fullbloom.uk.com",
    "phone":            "[Phone number]",
    "website":          "fullbloom.uk.com",
    "address":          "[Registered address]",
    "company_number":   "[Company No.]",
    "vat_number":       "[VAT No.]",
    "bank_name":        "[Bank name]",
    "bank_account":     "[Account number]",
    "bank_sort_code":   "[Sort code]",
    "payment_terms":    "A 50% deposit is required to confirm an order. The balance is due and cleared five working days before dispatch or delivery. Orders under £2,000 require full payment on confirmation.",
    "default_lead_time": "10–14 weeks, depending on maker capacity and material stock at the time of order"
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
