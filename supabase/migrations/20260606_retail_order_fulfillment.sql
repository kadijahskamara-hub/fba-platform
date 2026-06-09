-- Add fulfillment fields to retail_orders
alter table retail_orders
  add column if not exists tracking_number text,
  add column if not exists shipped_at      timestamptz;

-- Index for common admin query (orders by status)
create index if not exists idx_retail_orders_status
  on retail_orders (status, created_at desc);
