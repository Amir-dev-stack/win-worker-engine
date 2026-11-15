# Historical STS winning-coupon reference set (research only)

Dataset: [sts-winning-case-studies-2026.json](./sts-winning-case-studies-2026.json)

These four documented examples are **public reports about unusually large winning outcomes**, not a representative sample of placed bets. They must not be fed to the WIN predictor as positive training rows without matched losing tickets and a time-stamped pre-match information set. The source articles have inconsistent levels of detail; missing fields are intentionally `null`. This dataset is **not yet integrated into any agent runtime or persistence API**.

## Agent handling proposal

- **Department 5 (Strefa Inspiracji & Tipster Intelligence):** read as *historical inspiration*, decompose known accumulator/system/outright structures, identify missing individual-market records, and request independent primary evidence.
- **Department 3 (Markets & Settlement):** distinguish 1X2, outrights, mixed-sport accumulators, multiple coupons, settlement promotions, payout caps, and gross vs net payouts. Do not infer an original market or settlement rule.
- **Department 4 (Quantitative Evidence):** prohibit using winning examples to estimate success rates, model calibration, expected value, or ROI. Evaluate coupon-level joint probability and uncertainty with representative historical datasets.
- **Department 7 (Learning):** maintain separate labels for reported claim, bookmaker-confirmed result, individually verified leg, full coupon reconstructed, and representative validation cohort. Report missing evidence as a coverage gap.
- **Department 8 (Integrity):** preserve each source URL and publication date, check tax/limit conventions, flag contradictory sources and avoid publishing private ticket-owner details.

## Follow-up verification / integration backlog

1. Retrieve an official STS confirmation and, where legally available, original coupon screenshots or ticket details for each case. Check dates, actual bet types, all legs, price timestamps, result and settlement.
2. Resolve the 26-ticket outright case carefully. The reported 6,635.97 odds are for one ticket, not the aggregate of 26.
3. Ingest as a separate `historical_coupon_reference` dataset, **not** as outcomes used by live forecasting; wire a read-only retrieval tool only after schema/data provenance tests.
4. Include historical losing coupons and realistic base-rate data for any actual model evaluation. Avoid survivorship bias and leakage.
5. Add tests ensuring `verification_status=partial`, no fabricated legs, and no automatic live model-training import.

## Source context

- [LegalSport STS large-win retrospective (published 2026-11-03)](https://www.legalsport.pl/vademecum/wygrane/sts-najwyzsze-wygrane-na-zakladach/)
- [E-PLAY, 26 coupon STS report (2026-06-02)](https://e-play.pl/kolejna-gigantyczna-wygrana-w-sts-gracz-wygral-ponad-970-tysiecy-zlotych/)
- [Przegląd Sportowy / STS sponsored item (2026-06-01)](https://przegladsportowy.onet.pl/inne-sporty/kolejna-gigantyczna-wygrana-w-sts-gracz-wygral-ponad-970-tysiecy-zlotych/1h0j0yx)

The prior conversational top-ten table included older and less independently supported examples. This initial structured dataset includes only four cases with substantive 2026 reporting. It is not an official top-ten ranking.
