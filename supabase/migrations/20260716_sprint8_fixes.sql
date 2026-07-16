-- Sprint 8 (QA fixes, 16 Jul 2026)
-- 1. Communication packs can now reference a trade application, so the
--    "Send Detailed Form" action produces a real, visible pack in
--    /admin/communications (QA item 7). Additive and reversible.

alter table communication_packs
  add column if not exists trade_application_id uuid references trade_applications(id) on delete set null;

create index if not exists idx_comm_packs_trade_application
  on communication_packs (trade_application_id) where trade_application_id is not null;

-- Widen the has-entity guard to include trade applications.
alter table communication_packs drop constraint if exists chk_pack_has_entity;
alter table communication_packs add constraint chk_pack_has_entity check (
  commercial_order_id is not null or proforma_id is not null
  or sales_invoice_id is not null or purchase_order_id is not null
  or delivery_id is not null or trade_application_id is not null);

-- 2. Template for the detailed trade-application form pack (idempotent).
insert into communication_templates (template_key, label, audience, subject_template, body_template, variables)
select v.template_key, v.label, v.audience, v.subject_template, v.body_template, v.variables::jsonb
from (values
  ('trade_detailed_form','Trade application — detailed form','client',
   'Next steps for your Full Bloom Artelier trade application',
   E'Dear {{client_name}},\n\nThank you for applying for a trade account on behalf of {{applicant_company}}.\n\nTo help us process your application, please complete the short supplementary form here:\n\n{{form_url}}\n\nWith warm regards,\n{{company_name}}',
   '["client_name","applicant_company","form_url","company_name"]')
) as v(template_key, label, audience, subject_template, body_template, variables)
where not exists (select 1 from communication_templates t where t.template_key = v.template_key);
