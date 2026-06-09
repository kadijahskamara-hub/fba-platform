'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// ─── FAQ data ─────────────────────────────────────────────────────────────────

export const SECTIONS = [
  {
    title: 'Working with FBA',
    faqs: [
      {
        q: 'What exactly is Full Bloom Artelier?',
        a: `Full Bloom Artelier (FBA) is a London-based design procurement studio. We source and procure exceptional handcrafted furniture, lighting, and objects for interior designers, architects, hospitality developers, and discerning private clients. We are not a retailer — we are a specialist procurement partner who manages the entire journey from first discovery to room-ready delivery.`,
      },
      {
        q: 'Who do you work with?',
        a: `Our primary clients are interior design professionals, architects, and property developers working on high-end residential and hospitality projects. We also work with a select number of private individuals who are furnishing homes to a similar specification. If you're unsure whether we're the right fit, simply get in touch — we're always happy to have a conversation.`,
      },
      {
        q: 'How is FBA different from a standard furniture showroom?',
        a: `We don't hold stock. Instead, we maintain a curated network of skilled makers and artisan studios across Europe, Asia, Africa, and the Americas — and we source pieces specifically for each project. Every item in our Edit has been personally vetted. We also handle all compliance documentation, lead times, and logistics. You get the piece and a complete technical record. A showroom sells; we procure.`,
      },
      {
        q: 'Do I need to be a trade professional to buy from FBA?',
        a: `No. While the majority of our work is with the trade, we do work with private clients on larger residential commissions. That said, our pricing, lead times, and process are calibrated for professional projects. If you're decorating a single room rather than commissioning a full installation, the FBA platform may not be the right match — we're glad to point you in the right direction.`,
      },
    ],
  },
  {
    title: 'Trade Access',
    faqs: [
      {
        q: 'What is Trade Access and how do I apply?',
        a: `Trade Access is FBA's professional tier. It unlocks trade pricing, saved project boards, priority sourcing requests, and direct access to our procurement team. To apply, click "Apply for Trade Access" from the navigation and complete the short application. We review applications within 3 business days and approve based on professional credentials.`,
      },
      {
        q: 'What credentials do I need to qualify for trade?',
        a: `We look for evidence of professional practice — this can include a studio or company website, a portfolio, company registration, or a professional membership such as BIID, RIBA, or equivalent. If you're a sole practitioner or a recently established studio, please still apply and give us context. We assess each application on its merits.`,
      },
      {
        q: 'How long does trade approval take?',
        a: `Typically 2–3 business days from submission. During busy periods (particularly September–November), it may take up to 5 business days. You will receive an email notification when your application is reviewed.`,
      },
      {
        q: 'Can I use my trade account for multiple projects simultaneously?',
        a: `Yes. Your trade account supports multiple saved project boards, each with their own sourcing wishlist, quote requests, and order history. There is no limit on the number of active projects.`,
      },
    ],
  },
  {
    title: 'The FBA Edit & Sourcing',
    faqs: [
      {
        q: 'Is everything in the Edit available to order immediately?',
        a: `The Edit showcases our curated range of available pieces. Most items are made to order by our maker network — lead times typically range from 6 to 20 weeks depending on the piece and the maker's current capacity. We always confirm lead time and availability before any order is placed.`,
      },
      {
        q: "Can you source something that isn't in the Edit?",
        a: `Absolutely — bespoke sourcing is a core part of what we do. If you have a specific brief, material, dimension, or aesthetic in mind, send us a sourcing request via the Contact page or speak to your trade account manager. We draw on our full maker network and, where necessary, establish new maker relationships to meet the brief.`,
      },
      {
        q: 'Can pieces be customised?',
        a: `Yes, in most cases. Our maker network is built around craftspeople who work to specification. Dimensions, finishes, materials, and upholstery options are frequently adjustable. Each product page notes the customisation options available for that piece. For bespoke commissions with significant alterations, a formal atelier brief is drawn up before production begins.`,
      },
      {
        q: 'What is the FBA Collection?',
        a: `The FBA Collection is a curated grouping of pieces that represent the most distinctive work in our network — objects we consider signature, seasonally relevant, or particularly well-suited to the design directions we're seeing in current projects. It is refreshed periodically and is not exhaustive of our full sourcing capability.`,
      },
    ],
  },
  {
    title: 'The Technical Passport™',
    faqs: [
      {
        q: 'What is the Technical Passport™?',
        a: `The Technical Passport™ is FBA's proprietary documentation framework for every piece we procure. It provides a complete record of the piece's origin, materials, construction method, finishes, care requirements, compliance status (including Crib 5, REACH, and other relevant standards), and the maker's credentials. It travels with the piece and becomes part of your project file.`,
      },
      {
        q: 'Why does the Technical Passport™ matter for my projects?',
        a: `For hospitality and high-end residential projects, specification compliance is non-negotiable. Knowing that a piece meets fire retardancy, material safety, and durability standards before installation removes significant risk. The Technical Passport™ also simplifies handover documentation and gives your clients — and their insurers — confidence in what has been installed.`,
      },
      {
        q: 'Does every piece in the Edit come with a Technical Passport™?',
        a: `Every piece that is procured through FBA is issued a Technical Passport™ at the point of order confirmation. The depth of the passport varies by piece — some makers provide more granular material data than others — but the core record (origin, compliance, construction, care) is always present.`,
      },
      {
        q: 'Can I use the Technical Passport™ in my project handover documentation?',
        a: `Yes, and we encourage it. The passport is designed to be included in O&M manuals and client handover packs. It is issued in PDF format and can be supplied digitally or printed. If you need a specific format for a particular contractor or developer, speak to your account manager.`,
      },
    ],
  },
  {
    title: 'Ordering & Payment',
    faqs: [
      {
        q: 'How do I place an order?',
        a: `Most orders begin with an enquiry — either through a product page, a project board, or directly with our team. For trade clients, we issue a formal quotation that includes lead time, compliance notes, and shipping estimate. Once the quote is confirmed, a pro-forma invoice is raised and production begins on receipt of deposit.`,
      },
      {
        q: 'What are your payment terms?',
        a: `Standard terms are 50% deposit on order confirmation, with the balance due prior to dispatch. For established trade clients with a track record, we may extend 30-day net terms on a case-by-case basis. All invoices are issued in GBP. We accept bank transfer and major credit/debit cards.`,
      },
      {
        q: 'Do you charge VAT?',
        a: `FBA is VAT registered in the UK. VAT at the standard rate (currently 20%) applies to all UK orders. Export orders may be zero-rated depending on destination — please discuss with your account manager. VAT invoices are issued for all transactions.`,
      },
      {
        q: 'Can I cancel or amend an order once placed?',
        a: `Amendments are possible within 48 hours of order confirmation for most pieces — after this, production may have begun. Cancellations after production has started are subject to a cancellation fee (typically 25–50% of the order value depending on the stage of production). Bespoke and atelier commissions are non-cancellable once the brief is agreed and deposit received.`,
      },
    ],
  },
  {
    title: 'Delivery & Logistics',
    faqs: [
      {
        q: 'Do you deliver internationally?',
        a: `Yes. We deliver across the UK, Europe, the Middle East, and internationally by arrangement. All international shipments are handled by specialist art and furniture freight partners. Import duties and local taxes are the responsibility of the recipient unless otherwise agreed in writing.`,
      },
      {
        q: 'What does "room-ready delivery" mean?',
        a: `For qualifying orders, FBA coordinates white-glove delivery — the piece arrives unpacked, placed, assembled if required, and the packaging is removed. This service is available in London and major UK cities as standard, and in select European cities. Please request this at the enquiry stage so we can confirm availability and include it in the quote.`,
      },
      {
        q: 'What happens if a piece is damaged in transit?',
        a: `All FBA shipments are fully insured during transit. In the rare event of damage, please photograph the piece and packaging immediately upon delivery and notify us within 24 hours. We will arrange inspection, and where damage is confirmed, will either repair, replace, or refund depending on the severity and the maker's production capacity.`,
      },
      {
        q: 'How do I track my order?',
        a: `Trade account holders can track order status within their account dashboard. You will also receive email updates at key milestones: order confirmed, production begun, production complete, dispatched, and out for delivery. For specific tracking queries, your account manager is the fastest route.`,
      },
    ],
  },
]

// ─── Accordion item ───────────────────────────────────────────────────────────

function AccordionItem({ q, a, open, onToggle }: {
  q: string; a: string; open: boolean; onToggle: () => void
}) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--light-line)',
      marginBottom: 8,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', gap: 20, padding: '20px 24px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(15px, 1.4vw, 18px)',
          fontWeight: 400,
          color: 'var(--forest)',
          lineHeight: 1.4,
        }}>
          {q}
        </span>
        <span style={{
          flexShrink: 0,
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--forest)' : 'var(--cream)',
          border: '1px solid var(--light-line)',
          color: open ? 'var(--cream)' : 'var(--caramel)',
          transition: 'background 0.2s, color 0.2s',
          marginTop: 2,
        }}>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            style={{
              transition: 'transform 0.25s ease',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        </span>
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: open ? 1000 : 0,
        transition: 'max-height 0.35s ease',
      }}>
        <p style={{
          fontSize: 15,
          color: '#3d3a36',
          lineHeight: 1.85,
          padding: '0 24px 24px',
        }}>
          {a}
        </p>
      </div>
    </div>
  )
}

// ─── Exported accordion ───────────────────────────────────────────────────────

export default function FaqsAccordion() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})

  function toggle(key: string) {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      {SECTIONS.map((section, si) => (
        <div key={si} style={{ marginBottom: 48 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 16,
            marginBottom: 16, paddingBottom: 16,
            borderBottom: '2px solid var(--forest)',
          }}>
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 13, color: 'var(--sand)',
              letterSpacing: '0.08em',
            }}>
              {String(si + 1).padStart(2, '0')}
            </span>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(18px, 2vw, 22px)',
              fontWeight: 300,
              color: 'var(--forest)',
              letterSpacing: '-0.01em',
            }}>
              {section.title}
            </h2>
          </div>
          {section.faqs.map((faq, fi) => {
            const key = `${si}-${fi}`
            return (
              <AccordionItem
                key={key}
                q={faq.q}
                a={faq.a}
                open={!!openItems[key]}
                onToggle={() => toggle(key)}
              />
            )
          })}
        </div>
      ))}
    </>
  )
}
