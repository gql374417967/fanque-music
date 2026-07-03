# Step Workflow Refactor Checkpoint

Date: 2026-07-03

Implemented:
- `server/workflow.js` now supports creating a workflow without auto-running all steps.
- Added single-step execution via `runWorkflowStep(id, stepId, { regenerate })`.
- Added stop request support via `stopWorkflow(id)`. Running external API calls cannot be hard-aborted, but the run is marked stopped after the current await returns.
- `server/index.js` now exposes:
  - `POST /api/workflows` create only
  - `POST /api/workflows/:id/steps/:stepId/run` run/regenerate one step
  - `POST /api/workflows/:id/stop` request stop
- `public/app.js` now renders step cards with generate/regenerate/stop controls and polls while a step is running.
- `public/index.html` now hides API config by default behind a topbar button.
- `public/styles.css` was rewritten for responsive mobile layout.

Validated so far:
- `node --check server/workflow.js`
- `node --check server/index.js`
- `node --check public/app.js`

Next:
- Restart the local service on port 8787.
- Smoke test create workflow + run lyrics step.
- Open/scan UI and verify responsive controls.


## Verification Update

- Service is running at `http://127.0.0.1:8787` with PID 11064.
- Health endpoint returns ok.
- Creating a workflow now leaves all six steps pending and does not auto-run generation.
- Browser UI creation works: config panel is hidden by default, toggle opens/closes it, and only the lyrics step is initially enabled.
- Running the lyrics step from the UI enters a running state with a stop button, then returns to waiting confirmation.
- After lyrics finishes, only the music step is unlocked; cover/package/publish remain locked until prior steps finish.
- Lyrics preview, generated title, and generated theme render in the result panel.
- Syntax checks passed for `server/workflow.js`, `server/index.js`, and `public/app.js`.

Remaining check:
- Mobile-width overflow/responsive layout inspection.


## Fix Update: Regenerate Metadata and Form UX

- Added `autoGenerate` tracking for title/theme on workflow creation.
- When regenerating lyrics, auto-generated title/theme are cleared and generated again; manually entered title/theme are preserved.
- Hid the right result panel before a workflow is created.
- Added editable datalist controls for genre and mood: users can pick a common option or type any custom value.
- Restarted service on `http://127.0.0.1:8787` with PID 16484.
- Syntax checks passed for `server/workflow.js`, `server/index.js`, and `public/app.js`.
- API verification: empty title/theme run changed from `风起花落夜` / `岁月流转，风起花落夜，情感交织，梦回青春岁月。` to `心潮涌动情` / `心潮涌动情，海浪般旋律，爱恨交织旋律，写实人物封面，捕捉情感瞬间。` after lyrics regeneration.
