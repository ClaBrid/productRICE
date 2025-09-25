import React, { useEffect, useMemo, useState } from "react";

/**
 * Priority Scoring App — Product Deliverables & Epics (ROI‑driven)
 *
 * Added in this version:
 * - "What‑if" panel: temporary multipliers on weights (does NOT persist or change stored weights)
 * - Financial fields on epics: Revenue €, Opex €, Capex € with optional Auto‑ROI from (Revenue)/(Opex+Capex)
 * - OKR Alignment field separated from Strategic Alignment with its own weight
 * - ROI remains the main driver by default; you can tune weights
 * - Everything persists to LocalStorage; CSV export includes new fields
 */

// Weights
const DEFAULT_WEIGHTS = {
  roi: 0.4,          // main driver
  effort: -0.2,
  risk: -0.1,
  strategic: 0.12,
  okr: 0.08,         // NEW: explicit OKR alignment weight
  timeCriticality: 0.1,
  customerImpact: 0.1,
  confidence: 0.05,
  dependencies: -0.1,
};

// What‑if multipliers (1.0 = neutral). These scale the weights at runtime only.
const DEFAULT_WHATIF = {
  roi: 1.0,
  effort: 1.0,
  risk: 1.0,
  strategic: 1.0,
  okr: 1.0,
  timeCriticality: 1.0,
  customerImpact: 1.0,
  confidence: 1.0,
  dependencies: 1.0,
};

const SAMPLE_DATA = [
  {
    id: crypto.randomUUID(),
    name: "Checkout Revamp",
    owner: "Web Core",
    agg: "max",
    epics: [
      {
        id: crypto.randomUUID(),
        name: "Add one‑click checkout",
        // Financials (optional)
        revenueEUR: 250000, // annual uplift
        opexEUR: 20000,
        capexEUR: 80000,
        autoROI: true,      // compute ROI× = revenue / (opex+capex)

        // If autoROI=false, use manual roi× below
        roi: 2.5,           // fallback / manual ROI multiple

        effort: 13,         // story points
        risk: 3,            // 1(low) — 5(high)
        strategic: 4,       // 1—5 strategy alignment
        okr: 4,             // 1—5 OKR alignment (NEW)
        timeCriticality: 3, // 1—5 urgency
        customerImpact: 5,  // 1—5 impact
        confidence: 0.7,    // 0—1
        dependencies: 2,    // 0—5 (more is worse)
      },
      {
        id: crypto.randomUUID(),
        name: "Fraud rules tuning",
        revenueEUR: 80000,
        opexEUR: 5000,
        capexEUR: 20000,
        autoROI: true,
        roi: 1.3,
        effort: 5,
        risk: 2,
        strategic: 3,
        okr: 3,
        timeCriticality: 2,
        customerImpact: 3,
        confidence: 0.8,
        dependencies: 1,
      },
    ],
  },
  {
    id: crypto.randomUUID(),
    name: "Mobile Growth",
    owner: "Apps",
    agg: "average",
    epics: [
      {
        id: crypto.randomUUID(),
        name: "Push campaigns v2",
        autoROI: false,
        roi: 1.1,
        revenueEUR: 0,
        opexEUR: 0,
        capexEUR: 0,
        effort: 8,
        risk: 2,
        strategic: 4,
        okr: 3,
        timeCriticality: 4,
        customerImpact: 4,
        confidence: 0.6,
        dependencies: 0,
      },
    ],
  },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function badgeColor(score) {
  if (score >= 80) return "bg-green-600 text-white";
  if (score >= 60) return "bg-emerald-500 text-white";
  if (score >= 40) return "bg-yellow-500 text-black";
  if (score >= 20) return "bg-orange-500 text-white";
  return "bg-red-600 text-white";
}

function riskColor(r) {
  if (r <= 1) return "text-green-600";
  if (r <= 2) return "text-emerald-500";
  if (r <= 3) return "text-yellow-600";
  if (r <= 4) return "text-orange-600";
  return "text-red-600";
}

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState];
}

function effectiveWeights(weights, whatIf) {
  const out = { ...weights };
  for (const k of Object.keys(out)) {
    const m = whatIf[k] ?? 1;
    out[k] = out[k] * m;
  }
  return out;
}

function computeROI(epic) {
  if (epic.autoROI) {
    const denom = Math.max((Number(epic.opexEUR) || 0) + (Number(epic.capexEUR) || 0), 1);
    const numer = Math.max(Number(epic.revenueEUR) || 0, 0);
    return numer / denom; // ROI multiple
  }
  return Number(epic.roi) || 0;
}

function computeEpicScore(epic, weights) {
  // Normalize inputs into a 0..1 range where helpful
  const roiVal = computeROI(epic);
  const roiNorm = Math.tanh(roiVal / 2.5); // smooth cap

  // effort: 0..40 typical -> 0..1, higher is worse
  const effortNorm = Math.min(Number(epic.effort) / 40, 1);

  // risk 1..5 -> 0..1
  const riskNorm = clamp((Number(epic.risk) - 1) / 4, 0, 1);

  // 1..5 -> 0..1
  const stratNorm = clamp((Number(epic.strategic) - 1) / 4, 0, 1);
  const okrNorm = clamp((Number(epic.okr) - 1) / 4, 0, 1);
  const tcNorm = clamp((Number(epic.timeCriticality) - 1) / 4, 0, 1);
  const ciNorm = clamp((Number(epic.customerImpact) - 1) / 4, 0, 1);

  const confNorm = clamp(Number(epic.confidence), 0, 1);
  const depNorm = clamp(Number(epic.dependencies) / 5, 0, 1);

  const { roi, effort, risk, strategic, okr, timeCriticality, customerImpact, confidence, dependencies } = weights;

  const raw =
    roi * roiNorm +
    effort * effortNorm +
    risk * riskNorm +
    strategic * stratNorm +
    okr * okrNorm +
    timeCriticality * tcNorm +
    customerImpact * ciNorm +
    confidence * confNorm +
    dependencies * depNorm;

  // Scale to 0..100
  const scaled = clamp((raw + 1) * 50, 0, 100);
  return Math.round(scaled);
}

function aggregatePDScore(epics, weights, agg = "max") {
  if (!epics || epics.length === 0) return 0;
  const scores = epics.map(e => computeEpicScore(e, weights));
  if (agg === "average") return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  if (agg === "sum") return Math.round(Math.min(scores.reduce((a, b) => a + b, 0), 100));
  return Math.max(...scores); // default max
}

function numberInputProps(min, max, step, placeholder) {
  return {
    type: "number",
    min,
    max,
    step,
    placeholder,
    className:
      "w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
  };
}

export default function PriorityScoringApp() {
  const [weights, setWeights] = useLocalState("psa_weights", DEFAULT_WEIGHTS);
  const [whatIf, setWhatIf] = useLocalState("psa_whatif", DEFAULT_WHATIF);
  const [pds, setPds] = useLocalState("psa_pds", SAMPLE_DATA);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState("pdScore");
  const [sortDir, setSortDir] = useState("desc");

  const effWeights = useMemo(() => effectiveWeights(weights, whatIf), [weights, whatIf]);

  // Derived: PD with computed scores
  const computed = useMemo(() => {
    return pds.map(pd => ({
      ...pd,
      pdScore: aggregatePDScore(pd.epics, effWeights, pd.agg || "max"),
      epics: pd.epics.map(e => ({ ...e, score: computeEpicScore(e, effWeights), roiComputed: computeROI(e) })),
    }));
  }, [pds, effWeights]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const items = !f
      ? computed
      : computed.filter(pd =>
          pd.name.toLowerCase().includes(f) ||
          pd.owner?.toLowerCase().includes(f) ||
          pd.epics.some(e => e.name.toLowerCase().includes(f))
        );

    const sorted = [...items].sort((a, b) => {
      let av, bv;
      if (sortKey === "pdScore") { av = a.pdScore; bv = b.pdScore; }
      else if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "owner") { av = (a.owner || "").toLowerCase(); bv = (b.owner || "").toLowerCase(); }
      else { av = a.epics.length; bv = b.epics.length; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [computed, filter, sortDir, sortKey]);

  function addPD() {
    const id = crypto.randomUUID();
    setPds([
      ...pds,
      { id, name: "New Product Deliverable", owner: "", agg: "max", epics: [] },
    ]);
  }

  function addEpic(pdId) {
    setPds(pds.map(pd => {
      if (pd.id !== pdId) return pd;
      return {
        ...pd,
        epics: [
          ...pd.epics,
          {
            id: crypto.randomUUID(),
            name: "New Epic",
            revenueEUR: 0,
            opexEUR: 0,
            capexEUR: 0,
            autoROI: true,
            roi: 1.0,
            effort: 8,
            risk: 3,
            strategic: 3,
            okr: 3,
            timeCriticality: 3,
            customerImpact: 3,
            confidence: 0.6,
            dependencies: 1,
          },
        ],
      };
    }));
  }

  function updatePD(pdId, patch) {
    setPds(pds.map(pd => (pd.id === pdId ? { ...pd, ...patch } : pd)));
  }

  function updateEpic(pdId, epicId, patch) {
    setPds(pds.map(pd => {
      if (pd.id !== pdId) return pd;
      return {
        ...pd,
        epics: pd.epics.map(e => (e.id === epicId ? { ...e, ...patch } : e)),
      };
    }));
  }

  function removePD(pdId) {
    setPds(pds.filter(pd => pd.id !== pdId));
  }

  function removeEpic(pdId, epicId) {
    setPds(pds.map(pd => {
      if (pd.id !== pdId) return pd;
      return { ...pd, epics: pd.epics.filter(e => e.id !== epicId) };
    }));
  }

  function resetWeights() { setWeights(DEFAULT_WEIGHTS); }
  function resetWhatIf() { setWhatIf(DEFAULT_WHATIF); }

  function exportCSV() {
    const rows = [
      [
        "PD Name","Owner","PD Aggregation","Epic Name","ROI× (eff)","Revenue€","Opex€","Capex€","AutoROI","Effort","Risk","Strategic","OKR","TimeCriticality","CustomerImpact","Confidence","Dependencies","Epic Score","PD Score",
      ],
    ];

    computed.forEach(pd => {
      const pdScore = pd.pdScore;
      if (pd.epics.length === 0) {
        rows.push([pd.name, pd.owner || "", pd.agg || "max", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", pdScore]);
      } else {
        pd.epics.forEach(e => {
          rows.push([
            pd.name,
            pd.owner || "",
            pd.agg || "max",
            e.name,
            e.roiComputed,
            e.revenueEUR,
            e.opexEUR,
            e.capexEUR,
            e.autoROI,
            e.effort,
            e.risk,
            e.strategic,
            e.okr,
            e.timeCriticality,
            e.customerImpact,
            e.confidence,
            e.dependencies,
            e.score,
            pdScore,
          ]);
        });
      }
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `priority_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!Array.isArray(obj)) throw new Error("Invalid JSON shape (expected an array)");
        setPds(obj);
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-600 p-2 text-white shadow">ROI</div>
            <h1 className="text-xl font-semibold">Priority Scoring — PD & Epics</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter PDs & Epics…"
              className="w-64 rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={addPD} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-indigo-700">+ Add PD</button>
            <button onClick={exportCSV} className="rounded-xl bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-black">Export CSV</button>
            <label className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow hover:bg-slate-50 cursor-pointer">
              Import JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-3">
        {/* Weights & What‑if */}
        <section className="lg:col-span-1 space-y-6">
          {/* Weights panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Scoring Weights</h2>
              <button onClick={resetWeights} className="text-xs text-indigo-600 hover:underline">Reset</button>
            </div>
            <p className="mb-4 text-xs text-slate-500">ROI is the main driver by default. Positive weights increase score; negative weights decrease it. Scores are normalized to 0–100.</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(weights).map(([k, v]) => (
                <label key={k} className="flex items-center justify-between gap-3">
                  <span className="capitalize text-slate-600">{k.replaceAll(/([A-Z])/g, " $1")}</span>
                  <input
                    type="number"
                    step="0.05"
                    value={v}
                    onChange={(e) => setWeights({ ...weights, [k]: parseFloat(e.target.value) })}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1"
                    />
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-medium">Formula (epic):</p>
              <p>
                score = f( ROI, −Effort, −Risk, Strategic, OKR, Time Criticality, Customer Impact, Confidence, −Dependencies ) → 0–100
              </p>
            </div>
          </div>

          {/* What‑if panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">What‑if (temporary multipliers)</h2>
              <button onClick={resetWhatIf} className="text-xs text-indigo-600 hover:underline">Reset</button>
            </div>
            <p className="mb-4 text-xs text-slate-500">Drag sliders to stress‑test decisions without overwriting weights.</p>
            <div className="space-y-3">
              {Object.entries(whatIf).map(([k, v]) => (
                <div key={k} className="grid grid-cols-5 items-center gap-2 text-sm">
                  <span className="col-span-2 capitalize text-slate-600">{k.replaceAll(/([A-Z])/g, " $1")}</span>
                  <input
                    type="range" min={0.5} max={1.5} step={0.05}
                    value={v}
                    onChange={(e) => setWhatIf({ ...whatIf, [k]: parseFloat(e.target.value) })}
                    className="col-span-2"
                  />
                  <input
                    type="number" step={0.05} min={0.5} max={1.5}
                    value={v}
                    onChange={(e) => setWhatIf({ ...whatIf, [k]: parseFloat(e.target.value) })}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PDs & Epics */}
        <section className="lg:col-span-2">
          {visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No PDs yet. Click <span className="font-semibold">+ Add PD</span> to get started.
            </div>
          )}

          <div className="space-y-6">
            {visible.map(pd => (
              <div key={pd.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold ${badgeColor(pd.pdScore)}`}>
                      PD Score: {pd.pdScore}
                    </span>
                    <input
                      value={pd.name}
                      onChange={(e) => updatePD(pd.id, { name: e.target.value })}
                      className="w-80 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={pd.owner || ""}
                      onChange={(e) => updatePD(pd.id, { owner: e.target.value })}
                      placeholder="Owner/Team"
                      className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                      value={pd.agg || "max"}
                      onChange={(e) => updatePD(pd.id, { agg: e.target.value })}
                      className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="max">Aggregate: Max epic</option>
                      <option value="average">Aggregate: Average</option>
                      <option value="sum">Aggregate: Sum (cap 100)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => addEpic(pd.id)} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-indigo-700">+ Add Epic</button>
                    <button onClick={() => removePD(pd.id)} className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700">Delete PD</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] table-fixed">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="p-3 w-64">Epic</th>
                        <th className="p-3 w-20">Score</th>
                        <th className="p-3 w-24">ROI×</th>
                        <th className="p-3 w-28">Revenue€</th>
                        <th className="p-3 w-24">Opex€</th>
                        <th className="p-3 w-24">Capex€</th>
                        <th className="p-3 w-16">Auto</th>
                        <th className="p-3 w-20">Effort</th>
                        <th className="p-3 w-20">Risk</th>
                        <th className="p-3 w-24">Strategic</th>
                        <th className="p-3 w-20">OKR</th>
                        <th className="p-3 w-28">Time‑Crit</th>
                        <th className="p-3 w-28">Customer</th>
                        <th className="p-3 w-28">Confidence</th>
                        <th className="p-3 w-24">Deps</th>
                        <th className="p-3 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {pd.epics.map(epic => (
                        <tr key={epic.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 align-top">
                            <input
                              value={epic.name}
                              onChange={(e) => updateEpic(pd.id, epic.id, { name: e.target.value })}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-3 align-top">
                            <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold ${badgeColor(epic.score)}`}>
                              {epic.score}
                            </span>
                          </td>
                          <td className="p-3 align-top">
                            <div className="flex items-center gap-2">
                              <input
                                {...numberInputProps(0, 10, 0.1, "e.g., 1.5")}
                                value={epic.autoROI ? (Math.round(computeROI(epic)*100)/100) : (epic.roi ?? 0)}
                                onChange={(e) => updateEpic(pd.id, epic.id, { roi: parseFloat(e.target.value) })}
                                disabled={epic.autoROI}
                              />
                            </div>
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 1000000000, 1000, "€")}
                              value={epic.revenueEUR}
                              onChange={(e) => updateEpic(pd.id, epic.id, { revenueEUR: parseFloat(e.target.value) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 1000000000, 1000, "€")}
                              value={epic.opexEUR}
                              onChange={(e) => updateEpic(pd.id, epic.id, { opexEUR: parseFloat(e.target.value) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 1000000000, 1000, "€")}
                              value={epic.capexEUR}
                              onChange={(e) => updateEpic(pd.id, epic.id, { capexEUR: parseFloat(e.target.value) })}
                            />
                          </td>
                          <td className="p-3 align-top text-center">
                            <input
                              type="checkbox"
                              checked={!!epic.autoROI}
                              onChange={(e) => updateEpic(pd.id, epic.id, { autoROI: e.target.checked })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 100, 1, "SP")}
                              value={epic.effort}
                              onChange={(e) => updateEpic(pd.id, epic.id, { effort: parseInt(e.target.value || "0", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <div className="flex items-center gap-2">
                              <input
                                {...numberInputProps(1, 5, 1, "1-5")}
                                value={epic.risk}
                                onChange={(e) => updateEpic(pd.id, epic.id, { risk: parseInt(e.target.value || "1", 10) })}
                              />
                              <span className={`text-xs ${riskColor(epic.risk)}`}>●</span>
                            </div>
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(1, 5, 1, "1-5")}
                              value={epic.strategic}
                              onChange={(e) => updateEpic(pd.id, epic.id, { strategic: parseInt(e.target.value || "1", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(1, 5, 1, "1-5")}
                              value={epic.okr}
                              onChange={(e) => updateEpic(pd.id, epic.id, { okr: parseInt(e.target.value || "1", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(1, 5, 1, "1-5")}
                              value={epic.timeCriticality}
                              onChange={(e) => updateEpic(pd.id, epic.id, { timeCriticality: parseInt(e.target.value || "1", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(1, 5, 1, "1-5")}
                              value={epic.customerImpact}
                              onChange={(e) => updateEpic(pd.id, epic.id, { customerImpact: parseInt(e.target.value || "1", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 1, 0.05, "0-1")}
                              value={epic.confidence}
                              onChange={(e) => updateEpic(pd.id, epic.id, { confidence: parseFloat(e.target.value) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <input
                              {...numberInputProps(0, 5, 1, "0-5")}
                              value={epic.dependencies}
                              onChange={(e) => updateEpic(pd.id, epic.id, { dependencies: parseInt(e.target.value || "0", 10) })}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateEpic(pd.id, epic.id, { revenueEUR: 0, opexEUR: 0, capexEUR: 0 })}
                                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                              >
                                Clear €
                              </button>
                              <button
                                onClick={() => removeEpic(pd.id, epic.id)}
                                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={16} className="p-3">
                          <button onClick={() => addEpic(pd.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Add Epic</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-500">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-1 font-medium text-slate-700">Tips</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Use <span className="font-semibold">Auto‑ROI</span> to compute ROI× = Revenue € / (Opex € + Capex €). Switch off to enter ROI manually.</li>
            <li>"What‑if" multipliers scale weights temporarily so you can say things like “If risk matters 30% more, what changes?”</li>
            <li>Aggregation controls whether a PD is driven by its strongest epic (Max), balanced (Average), or cumulative (Sum, capped at 100 for readability).</li>
            <li>Export to CSV for stakeholder decks; Import JSON to restore a saved backlog.</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}