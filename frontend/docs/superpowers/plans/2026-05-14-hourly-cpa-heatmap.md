# Hourly CPA Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the hourly CPA table into a readable heatmap with a consistent CPA scale and explicit cell states.

**Architecture:** Keep the existing `buildHourlyCpaHeatmapCells` aggregation as the source of truth, fix CPA edge-case handling there, and move the readability improvements into `HourlyCpaHeatmapSection.tsx` through derived summaries, legend, and cell-state styling.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite

---

### Task 1: Fix hourly CPA semantics

**Files:**
- Modify: `src/lib/timeSeriesFromMeta.ts`

- [ ] **Step 1: Update CPA calculation**

Make cells with `results > 0` and `spend = 0` render as `0` CPA instead of `null`.

- [ ] **Step 2: Preserve cell detail for render states**

Keep `spend` and `results` on each cell so the component can distinguish `sin datos` from `gasto sin resultados`.

### Task 2: Redesign the heatmap component

**Files:**
- Modify: `src/components/HourlyCpaHeatmapSection.tsx`

- [ ] **Step 1: Add derived summaries**

Compute min/max valid CPA cells and expose best/worst slot summaries.

- [ ] **Step 2: Replace position-based coloring**

Remove the current position-driven fill logic and use a single cost-based color scale.

- [ ] **Step 3: Add explicit cell-state rendering**

Render three states:
- valid CPA
- no data
- spend without results

- [ ] **Step 4: Add legend and quick summary**

Show `más barato -> más caro`, best slot, worst slot, and max observed above the matrix.

### Task 3: Verify

**Files:**
- Verify: `src/components/HourlyCpaHeatmapSection.tsx`
- Verify: `src/lib/timeSeriesFromMeta.ts`

- [ ] **Step 1: Run type/build verification**

Run: `npm run build`

- [ ] **Step 2: Run lint if it is already green enough in this repo**

Run: `npm run lint`

- [ ] **Step 3: Summarize any repo-level blockers**

If verification fails because of unrelated pre-existing issues, record them and separate them from this change.
