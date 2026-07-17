# DBS Batch Workbench

Unified shop-floor app for a **single order batch** that arrives with **two companion CSVs**:

1. **Top Edge CSV** → production report (boxes, LF, rips, cut optimization, print, saw sync)
2. **OptiCut CSV** → cut-list batches (export ZIP, print cut lists / batch index, Station)

The original standalone apps are **not modified**. This is a new project that ports both tools side-by-side with separate import pipelines and shared batch chrome.

## Routes

| Hash | View |
|---|---|
| `#batch` | Paired import home (default) |
| `#top-edge` | Top Edge calculator |
| `#opticut` | OptiCut CSV splitter |
| `#station` | Live station queue |

## Run

```bash
npm install
npm run dev
npm test
npm run build
npm run deploy   # build → docs/ for GitHub Pages
```

## Live

GitHub Pages (after deploy):  
https://drawerboxspecialties-ops.github.io/DBSBatchWorkbench/

## Important

- Each tool keeps its own CSV, state, filters, math, and print styles.
- Top Edge saw sync still posts to `http://localhost:8787/sync-report`.
- OptiCut Station still uses the existing Firebase project config.
- Business rules are covered by Vitest (OptiCut modules + Top Edge calculator/report/parse tests).

## License

All rights reserved. Internal tooling — see repository owner for usage rights.
