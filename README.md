# Priority Scoring App — Product Deliverables & Epics

A lightweight React + Tailwind app to help Product Mangers and Product Owners prioritize **Product Deliverables (PDs)** and **Epics**, with ROI as the main driver.

## Features
- ROI-first scoring with editable weights
- **What-if** multipliers (temporary, non-persistent)
- Financials per Epic: Revenue €, Opex €, Capex €, **Auto-ROI**
- Separate **OKR alignment** weight
- Aggregate PD score: Max / Average / Sum
- LocalStorage persistence
- CSV export & JSON import
- Vite + React + Tailwind

## Quickstart
```bash
npm install
npm run dev
# open http://localhost:5173
```

## Build
```bash
npm run build
npm run preview
```

## Notes
- ROI× (effective) = Revenue€ / (Opex€ + Capex€) when Auto-ROI is on; otherwise from manual ROI field.
- Scores are scaled to 0–100 for readability.
