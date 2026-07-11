"use strict";
// ============================================================
// Commercial calculation engine — the single authoritative
// implementation of FBA's commercial arithmetic.
//
// - Pure module: no server imports, usable from UI previews,
//   API routes, document renderers, and tests.
// - All arithmetic is performed in integer minor units (pence)
//   with explicit half-up rounding; floats never accumulate.
// - Rerun on the server before every save, approval, or issue.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMinor = toMinor;
exports.fromMinor = fromMinor;
exports.roundHalfUp = roundHalfUp;
exports.deriveSellingMinor = deriveSellingMinor;
exports.markupPercent = markupPercent;
exports.marginPercent = marginPercent;
exports.calculateLine = calculateLine;
exports.evaluateApproval = evaluateApproval;
exports.calculateDocument = calculateDocument;
exports.verifyClientTotals = verifyClientTotals;
exports.resolveDepositPercent = resolveDepositPercent;
// ── Money: integer minor units ───────────────────────────────
/** Convert major units (e.g. pounds) to integer minor units (pence), half-up. */
function toMinor(major) {
    if (!Number.isFinite(major))
        return 0;
    return roundHalfUp(major * 100);
}
/** Convert integer minor units back to major units. */
function fromMinor(minor) {
    return minor / 100;
}
/** Deterministic half-up rounding to the nearest integer (handles negatives symmetrically). */
function roundHalfUp(x) {
    if (!Number.isFinite(x))
        return 0;
    return x < 0 ? -Math.round(-x) : Math.round(x);
}
/** Apply a percentage to a minor-unit amount with half-up rounding. */
function pctOfMinor(minor, percent) {
    return roundHalfUp((minor * percent) / 100);
}
// ── Selling price derivation ─────────────────────────────────
/**
 * Derive a unit selling price (minor units) from cost + method.
 *   Markup % = (sell − cost) / cost × 100  → sell = cost × (1 + p/100)
 *   Margin % = (sell − cost) / sell × 100  → sell = cost / (1 − p/100)
 * Returns { minor, invalid } — invalid marks unusable configurations
 * (margin ≥ 100%, non-finite results); the caller treats these as
 * requiring attention rather than silently producing figures.
 */
function deriveSellingMinor(costUnitMinor, method, percent) {
    if (!Number.isFinite(percent))
        return { minor: costUnitMinor, invalid: true };
    if (method === 'markup') {
        return { minor: roundHalfUp(costUnitMinor * (1 + percent / 100)), invalid: false };
    }
    // margin
    if (percent >= 100)
        return { minor: costUnitMinor, invalid: true };
    const raw = costUnitMinor / (1 - percent / 100);
    if (!Number.isFinite(raw))
        return { minor: costUnitMinor, invalid: true };
    return { minor: roundHalfUp(raw), invalid: false };
}
/** Markup % from cost and selling (both minor units); null when cost is 0/unknown. */
function markupPercent(costMinor, sellMinor) {
    if (costMinor === null || costMinor === 0)
        return null;
    return ((sellMinor - costMinor) / costMinor) * 100;
}
/** Margin % from cost and selling (both minor units); null when selling is 0 or cost unknown. */
function marginPercent(costMinor, sellMinor) {
    if (costMinor === null || sellMinor === 0)
        return null;
    return ((sellMinor - costMinor) / sellMinor) * 100;
}
// ── Tax ──────────────────────────────────────────────────────
function taxRateFor(category, vatRegistered, rates) {
    if (!vatRegistered)
        return 0;
    switch (category) {
        case 'standard': return rates.standard;
        case 'reduced': return rates.reduced;
        default: return 0; // zero / exempt / outside_scope
    }
}
// ── Line calculation ─────────────────────────────────────────
function calculateLine(input, vatRegistered, taxRates) {
    const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
    const costUnavailable = input.supplierCostUnit === null || input.supplierCostUnit === undefined;
    const costUnitMinor = costUnavailable ? null : toMinor(input.supplierCostUnit);
    // Unit selling price
    let sellUnitMinor = 0;
    let invalidPricing = false;
    if (input.pricingMethod === 'manual') {
        sellUnitMinor = toMinor(input.sellingPriceUnit ?? 0);
    }
    else if (costUnitMinor === null) {
        // Percentage pricing without a cost basis is impossible: fall back
        // to any manual selling price provided, and flag it.
        sellUnitMinor = toMinor(input.sellingPriceUnit ?? 0);
        invalidPricing = input.sellingPriceUnit == null;
    }
    else {
        const derived = deriveSellingMinor(costUnitMinor, input.pricingMethod, input.pricingPercent ?? 0);
        sellUnitMinor = derived.minor;
        invalidPricing = derived.invalid;
    }
    if (sellUnitMinor < 0) {
        sellUnitMinor = 0;
        invalidPricing = true;
    }
    // Totals before discount — multiply unit minor price by quantity, then round
    // once (supports fractional quantities without per-unit drift).
    const netBeforeDiscountMinor = roundHalfUp(sellUnitMinor * qty);
    const costTotalMinor = costUnitMinor === null ? null : roundHalfUp(costUnitMinor * qty);
    // Discount
    let discountMinor = 0;
    if (input.discountType === 'percent' && input.discountValue != null) {
        const p = Math.min(Math.max(input.discountValue, 0), 100);
        discountMinor = pctOfMinor(netBeforeDiscountMinor, p);
    }
    else if (input.discountType === 'fixed' && input.discountValue != null) {
        discountMinor = Math.min(Math.max(toMinor(input.discountValue), 0), netBeforeDiscountMinor);
    }
    const netMinor = netBeforeDiscountMinor - discountMinor;
    const discountPercentEffective = netBeforeDiscountMinor > 0
        ? (discountMinor / netBeforeDiscountMinor) * 100
        : 0;
    // Tax
    const rate = taxRateFor(input.taxCategory, vatRegistered, taxRates);
    const taxMinor = pctOfMinor(netMinor, rate);
    const grossMinor = netMinor + taxMinor;
    // Profitability
    const margin = marginPercent(costTotalMinor, netMinor);
    const markup = markupPercent(costTotalMinor, netMinor);
    return {
        id: input.id,
        lineType: input.lineType,
        quantity: qty,
        supplierCostUnit: costUnavailable ? null : fromMinor(costUnitMinor),
        sellingPriceUnit: fromMinor(sellUnitMinor),
        lineCostTotal: costTotalMinor === null ? null : fromMinor(costTotalMinor),
        lineNetBeforeDiscount: fromMinor(netBeforeDiscountMinor),
        discountAmount: fromMinor(discountMinor),
        discountPercentEffective,
        lineNetTotal: fromMinor(netMinor),
        taxCategory: input.taxCategory,
        taxRate: rate,
        lineTaxTotal: fromMinor(taxMinor),
        lineGrossTotal: fromMinor(grossMinor),
        marginPercent: margin,
        markupPercent: markup,
        flags: {
            zeroCost: costUnitMinor === 0,
            invalidPricing,
            negativeMargin: margin !== null && margin < 0,
            costUnavailable,
        },
    };
}
// ── Procurement fee ──────────────────────────────────────────
function procurementBasisMinor(input, lines) {
    const cfg = input.procurementFee;
    const productLines = lines.filter(l => l.lineType === 'product');
    switch (cfg.basis) {
        case 'product_selling_subtotal':
            return productLines.reduce((s, l) => s + toMinor(l.lineNetTotal), 0);
        case 'product_cost_subtotal':
            return productLines.reduce((s, l) => s + toMinor(l.lineCostTotal ?? 0), 0);
        case 'approved_procurement_value':
        case 'manual_base_amount':
            return toMinor(cfg.manualBase ?? 0);
        case 'selected_lines': {
            const selected = lines.filter((l, i) => input.lines[i]?.procurementFeeSelected && l.lineType !== 'fee');
            return selected.reduce((s, l) => s + toMinor(l.lineNetTotal), 0);
        }
    }
}
function procurementFeeMinor(input, basisMinor) {
    const cfg = input.procurementFee;
    switch (cfg.type) {
        case 'none': return 0;
        case 'percentage': return pctOfMinor(basisMinor, cfg.value);
        case 'fixed': return toMinor(cfg.value);
        case 'tiered': {
            const tiers = cfg.tiers ?? [];
            const basisMajor = fromMinor(basisMinor);
            for (const t of tiers) {
                if (t.up_to === null || basisMajor <= t.up_to)
                    return toMinor(t.value);
            }
            const last = tiers[tiers.length - 1];
            return last ? toMinor(last.value) : 0;
        }
    }
}
// ── Approval evaluation ──────────────────────────────────────
function evaluateApproval(input, lines, feeOverridden) {
    const t = input.thresholds;
    const reasons = [];
    let level = 'none';
    const raise = (to) => {
        const order = { none: 0, commercial: 1, ultra: 2, blocked: 3 };
        if (order[to] > order[level])
            level = to;
    };
    for (const l of lines) {
        if (l.flags.negativeMargin) {
            raise('blocked');
            reasons.push(`Negative margin on line ${l.id ?? ''} (${l.marginPercent.toFixed(1)}%) — blocked; Ultra Admin approval required to proceed.`);
            continue;
        }
        if (l.marginPercent !== null && l.lineType === 'product') {
            if (l.marginPercent < t.margin_ultra_below) {
                raise('ultra');
                reasons.push(`Margin ${l.marginPercent.toFixed(1)}% is below ${t.margin_ultra_below}% — Ultra Admin approval required.`);
            }
            else if (l.marginPercent < t.margin_commercial_below) {
                raise('commercial');
                reasons.push(`Margin ${l.marginPercent.toFixed(1)}% is below ${t.margin_commercial_below}% — Commercial Admin approval required.`);
            }
        }
        if (l.discountPercentEffective > t.discount_ultra_above) {
            raise('ultra');
            reasons.push(`Discount ${l.discountPercentEffective.toFixed(1)}% exceeds ${t.discount_ultra_above}% — Ultra Admin approval required.`);
        }
        else if (l.discountPercentEffective > t.discount_commercial_above) {
            raise('commercial');
            reasons.push(`Discount ${l.discountPercentEffective.toFixed(1)}% exceeds ${t.discount_commercial_above}% — Commercial Admin approval required.`);
        }
    }
    if (input.supplierCostOverridden) {
        raise('commercial');
        reasons.push('Manual supplier-cost override — Commercial Admin approval required.');
    }
    if (input.exchangeRateOverridden) {
        raise('commercial');
        reasons.push('Manual exchange-rate override — Commercial Admin approval required.');
    }
    if (feeOverridden) {
        raise('commercial');
        reasons.push('Procurement fee manually overridden — Commercial Admin approval required.');
    }
    return { level, reasons };
}
// ── Document calculation ─────────────────────────────────────
function calculateDocument(input) {
    const lines = input.lines.map(l => calculateLine(l, input.vatRegistered, input.taxRates));
    const sumMinor = (xs, f) => xs.reduce((s, l) => s + toMinor(f(l)), 0);
    const productLines = lines.filter(l => l.lineType === 'product');
    const serviceLines = lines.filter(l => l.lineType === 'service');
    const otherLines = lines.filter(l => !['product', 'service'].includes(l.lineType));
    const costIncomplete = productLines.some(l => l.flags.costUnavailable);
    const productCostMinor = costIncomplete ? null : sumMinor(productLines, l => l.lineCostTotal ?? 0);
    const productSellMinor = sumMinor(productLines, l => l.lineNetTotal);
    const serviceMinor = sumMinor(serviceLines, l => l.lineNetTotal);
    const otherMinor = sumMinor(otherLines, l => l.lineNetTotal);
    const discountMinor = sumMinor(lines, l => l.discountAmount);
    // Procurement fee
    const basisMinor = procurementBasisMinor(input, lines);
    const calculatedFeeMinor = procurementFeeMinor(input, basisMinor);
    const feeOverridden = input.procurementFee.override != null;
    const feeMinor = feeOverridden ? toMinor(input.procurementFee.override) : calculatedFeeMinor;
    // VAT by category (line level), plus fee VAT at the standard rate when registered.
    const vatByCategory = {};
    let vatMinor = 0;
    for (const l of lines) {
        const m = toMinor(l.lineTaxTotal);
        if (m !== 0 || l.taxRate > 0) {
            vatByCategory[l.taxCategory] = (vatByCategory[l.taxCategory] ?? 0) + fromMinor(m);
        }
        vatMinor += m;
    }
    const feeVatMinor = input.vatRegistered && feeMinor > 0 ? pctOfMinor(feeMinor, input.taxRates.standard) : 0;
    if (feeVatMinor > 0) {
        vatByCategory.standard = (vatByCategory.standard ?? 0) + fromMinor(feeVatMinor);
    }
    vatMinor += feeVatMinor;
    const netMinor = productSellMinor + serviceMinor + otherMinor + feeMinor;
    const grossMinor = netMinor + vatMinor;
    // Deposit requested (never labelled "paid")
    const depositBaseMinor = input.depositBasis === 'net_subtotal' ? netMinor : grossMinor;
    const depositPercent = Math.min(Math.max(input.depositPercent, 0), 100);
    const depositMinor = pctOfMinor(depositBaseMinor, depositPercent);
    const paymentsMinor = toMinor(input.paymentsReceived ?? 0);
    const creditMinor = toMinor(input.creditTotal ?? 0);
    const balanceMinor = grossMinor - paymentsMinor - creditMinor;
    // Effective document-level profitability (cost-known product lines only)
    const effMarkup = productCostMinor === null ? null : markupPercent(productCostMinor, productSellMinor);
    const effMargin = productCostMinor === null ? null : marginPercent(productCostMinor, productSellMinor);
    const approval = evaluateApproval(input, lines, feeOverridden);
    return {
        lines,
        productCostSubtotal: productCostMinor === null ? null : fromMinor(productCostMinor),
        productSellingSubtotal: fromMinor(productSellMinor),
        serviceSubtotal: fromMinor(serviceMinor),
        otherChargesSubtotal: fromMinor(otherMinor),
        discountTotal: fromMinor(discountMinor),
        procurementFeeBasisAmount: fromMinor(basisMinor),
        procurementFee: fromMinor(feeMinor),
        procurementFeeOverridden: feeOverridden,
        netSubtotal: fromMinor(netMinor),
        vatByCategory,
        vatTotal: fromMinor(vatMinor),
        grossTotal: fromMinor(grossMinor),
        depositRequested: fromMinor(depositMinor),
        paymentsReceived: fromMinor(paymentsMinor),
        creditTotal: fromMinor(creditMinor),
        balanceDue: fromMinor(balanceMinor),
        effectiveMarkupPercent: effMarkup,
        effectiveMarginPercent: effMargin,
        costIncomplete,
        approval,
    };
}
// ── Anti-tampering cross-check ───────────────────────────────
/**
 * Compare client-claimed totals against the server calculation.
 * Returns a list of mismatches (empty = consistent). Tolerance is
 * one minor unit to absorb display rounding.
 */
function verifyClientTotals(claim, computed) {
    const mismatches = [];
    const check = (name, claimed, actual) => {
        if (claimed === undefined)
            return;
        if (Math.abs(toMinor(claimed) - toMinor(actual)) > 1) {
            mismatches.push(`${name}: client claimed ${claimed}, server calculated ${actual}`);
        }
    };
    check('netSubtotal', claim.netSubtotal, computed.netSubtotal);
    check('vatTotal', claim.vatTotal, computed.vatTotal);
    check('grossTotal', claim.grossTotal, computed.grossTotal);
    return mismatches;
}
/**
 * Resolve the deposit percent for an order value from settings rules:
 * value-based rules override the global default where they match.
 */
function resolveDepositPercent(defaultPercent, rules, grossTotal) {
    let result = defaultPercent;
    const sorted = [...(rules ?? [])].sort((a, b) => a.min_order_value - b.min_order_value);
    for (const r of sorted) {
        if (grossTotal >= r.min_order_value)
            result = r.deposit_percent;
    }
    return result;
}
