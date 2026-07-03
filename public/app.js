const form = document.querySelector('#workflowForm');
const configForm = document.querySelector('#configForm');
const submitBtn = document.querySelector('#submitBtn');
const saveConfigBtn = document.querySelector('#saveConfigBtn');
const diagnoseBtn = document.querySelector('#diagnoseBtn');
const diagnoseCurrentOnly = document.querySelector('#diagnoseCurrentOnly');
const configToggle = document.querySelector('#configToggle');
const configBody = document.querySelector('#configBody');
const health = document.querySelector('#health');
const runTitle = document.querySelector('#runTitle');
const runMeta = document.querySelector('#runMeta');
const steps = document.querySelector('#steps');
const errorBox = document.querySelector('#errorBox');
const resultGrid = document.querySelector('#resultGrid');
const lyricsBox = document.querySelector('#lyricsBox');
const packageLink = document.querySelector('#packageLink');
const resultPanel = document.querySelector('#resultPanel');
const configStatus = document.querySelector('#configStatus');
const durationInput = document.querySelector('#duration');
const durationValue = document.querySelector('#durationValue');


const stepNames = {
  lyrics: '歌词',
  music: '音乐',
  cover: '封面',
  postCover: '封面后处理',
  package: '发布包',
  publish: '上架'
};

let currentRun = null;
let pollTimer = null;
let autoAdvanceTimer = null;
let autoAdvanceStepId = null;

function setHidden(el, hidden) {
  el.classList.toggle('hidden', hidden);
}

function clearAutoAdvance() {
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
  autoAdvanceStepId = null;
}

function getChoiceSelect(name) {
  return form.querySelector(`[data-choice-for="${name}"]`);
}

function getChoiceCustom(name) {
  return form.querySelector(`[data-custom-for="${name}"]`);
}

function syncChoice(name) {
  const select = getChoiceSelect(name);
  const custom = getChoiceCustom(name);
  const hidden = form.elements.namedItem(name);
  if (!select || !custom || !hidden) return;
  const isCustom = select.value === '__custom__';
  setHidden(custom, !isCustom);
  custom.disabled = !isCustom;
  custom.required = isCustom;
  hidden.value = isCustom ? custom.value.trim() : select.value;
}

function initChoiceInputs() {
  for (const name of ['genre', 'mood']) {
    const select = getChoiceSelect(name);
    const custom = getChoiceCustom(name);
    if (!select || !custom) continue;
    select.name = `${name}Preset`;
    custom.name = `${name}Custom`;
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    select.addEventListener('mousedown', (event) => event.stopPropagation());
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', () => syncChoice(name));
    custom.addEventListener('input', () => syncChoice(name));
    syncChoice(name);
  }
}

function showError(message) {
  errorBox.textContent = message || '';
  setHidden(errorBox, !message);
}

function statusText(status) {
  return ({
    idle: '待开始',
    waiting: '等待确认',
    running: '生成中',
    stopped: '已停止',
    failed: '失败',
    done: '已完成',
    pending: '待生成',
    skipped: '已跳过',
    stopping: '停止中'
  })[status] || status;
}

function renderDiagnosisResult(results) {
  const entries = Object.entries(results || {});
  if (!entries.length) {
    configStatus.textContent = '暂无诊断结果';
    configStatus.classList.remove('diagnoseGrid');
    configStatus.style.whiteSpace = 'pre-wrap';
    return;
  }
  const items = entries.map(([name, item]) => {
    const status = item.ok ? '可用' : '不可用';
    const stateClass = item.ok ? 'ok' : 'bad';
    const code = item.status ? `HTTP ${item.status}` : '无状态码';
    const message = item.message ? item.message.replace(/\s+/g, ' ').slice(0, 180) : '无摘要';
    return `<div class="diagnoseCard ${stateClass}"><strong>${name}</strong><span>${status}</span><small>${code}</small><p>${message}</p></div>`;
  });
  configStatus.innerHTML = items.join('');
  configStatus.classList.add('diagnoseGrid');
  configStatus.style.whiteSpace = 'normal';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error?.message || data?.error || text || `HTTP ${response.status}`);
  return data;
}

function buildFormData() {
  return new FormData(form);
}

function buildConfigPayload() {
  const payload = {};
  for (const element of configForm.elements) {
    if (!element.name) continue;
    if (element.type === 'password' && !element.value.trim()) continue;
    payload[element.name] = element.value.trim();
  }
  return payload;
}

function canRunStep(run, step, index) {
  if (!run || run.status === 'running') return false;
  if (step.status === 'running' || step.status === 'stopping') return false;
  if (index === 0) return true;
  const previous = run.steps[index - 1];
  return ['done', 'skipped'].includes(previous.status);
}

function firstRunnableStep(run) {
  if (!run) return null;
  return run.steps.find((step, index) => canRunStep(run, step, index) && !['done', 'skipped'].includes(step.status));
}

function renderSteps(run) {
  steps.innerHTML = '';
  if (!run) return;
  const next = firstRunnableStep(run);
  run.steps.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = `step ${step.status}`;

    const top = document.createElement('div');
    top.className = 'stepTop';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${stepNames[step.id] || step.label}`;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = statusText(step.status);
    top.append(title, badge);

    const detail = document.createElement('p');
    detail.textContent = step.detail || step.label;

    const actions = document.createElement('div');
    actions.className = 'stepActions';
    const enabled = canRunStep(run, step, index);
    const finished = ['done', 'skipped'].includes(step.status);

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = finished ? 'secondary' : 'primary';
    runBtn.textContent = finished ? '重新生成' : (step === next ? '生成这一步' : '等待上一步');
    runBtn.disabled = !enabled;
    runBtn.addEventListener('click', () => {
      clearAutoAdvance();
      runStep(step.id, finished);
    });

    actions.append(runBtn);
    if (run.status === 'running' && run.activeStep === step.id) {
      const stopBtn = document.createElement('button');
      stopBtn.type = 'button';
      stopBtn.className = 'danger';
      stopBtn.textContent = '停止';
      stopBtn.addEventListener('click', stopRun);
      actions.append(stopBtn);
    }

    card.append(top, detail, actions);
    steps.append(card);
  });
}

function runMetaText(run, suffix = '') {
  const base = `${statusText(run.status)} · ${run.input?.artist || ''} · ${run.input?.genre || ''} · ${run.input?.mood || ''}`;
  return suffix ? `${base} · ${suffix}` : base;
}

function scheduleAutoAdvance(run) {
  if (!run || run.status !== 'waiting') {
    clearAutoAdvance();
    return;
  }
  const next = firstRunnableStep(run);
  if (!next) {
    clearAutoAdvance();
    return;
  }
  if (autoAdvanceStepId === next.id && autoAdvanceTimer) return;
  clearAutoAdvance();
  autoAdvanceStepId = next.id;
  let seconds = 5;
  const label = stepNames[next.id] || next.label;
  runMeta.textContent = runMetaText(run, `${seconds}s 后自动进入${label}`);
  autoAdvanceTimer = setInterval(() => {
    seconds -= 1;
    if (seconds > 0) {
      runMeta.textContent = runMetaText(run, `${seconds}s 后自动进入${label}`);
      return;
    }
    clearAutoAdvance();
    runStep(next.id).catch((error) => showError(error.message));
  }, 1000);
}

function renderResults(run) {
  resultGrid.innerHTML = '';
  setHidden(packageLink, true);
  setHidden(lyricsBox, !run?.lyrics);
  if (!run) return;

  if (run.lyrics) lyricsBox.textContent = run.lyrics;
  const items = [];
  if (run.input?.title) items.push(['歌名', run.input.title]);
  if (run.input?.theme) items.push(['主题', run.input.theme]);
  if (run.audioUrl) items.push(['MP3', `<audio controls src="${run.audioUrl}"></audio>`]);
  if (run.coverUrl) items.push(['封面', `<img class="cover" src="${run.coverUrl}" alt="封面" />`]);
  if (run.publishResult) items.push(['上架结果', `<pre>${JSON.stringify(run.publishResult, null, 2)}</pre>`]);

  for (const [label, value] of items) {
    const item = document.createElement('div');
    item.className = 'resultItem';
    item.innerHTML = `<span>${label}</span><div>${value}</div>`;
    resultGrid.append(item);
  }

  if (run.packageUrl) {
    packageLink.href = run.packageUrl;
    setHidden(packageLink, false);
  }
}

function renderRun(run) {
  currentRun = run;
  setHidden(resultPanel, !run);
  if (!run) {
    clearAutoAdvance();
    runTitle.textContent = '还没有创建任务';
    runMeta.textContent = '填写左侧信息后，先创建任务，再逐步生成';
    renderSteps(null);
    renderResults(null);
    return;
  }
  runTitle.textContent = run.input?.title || '待自动生成歌名';
  runMeta.textContent = `${statusText(run.status)} · ${run.input?.artist || ''} · ${run.input?.genre || ''} · ${run.input?.mood || ''}`;
  showError(run.error || '');
  renderSteps(run);
  renderResults(run);
  scheduleAutoAdvance(run);
}

async function refreshRun() {
  if (!currentRun?.id) return;
  const run = await requestJson(`/api/workflows/${currentRun.id}`);
  renderRun(run);
  if (run.status !== 'running') stopPolling();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => refreshRun().catch((error) => showError(error.message)), 1800);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function runStep(stepId, regenerate = false) {
  if (!currentRun?.id) return;
  showError('');
  startPolling();
  renderRun({ ...currentRun, status: 'running', activeStep: stepId });
  try {
    const run = await requestJson(`/api/workflows/${currentRun.id}/steps/${stepId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate })
    });
    renderRun(run);
  } catch (error) {
    showError(error.message);
  } finally {
    await refreshRun().catch(() => {});
    if (currentRun?.status !== 'waiting') stopPolling();
  }
}

async function stopRun() {
  if (!currentRun?.id) return;
  try {
    const run = await requestJson(`/api/workflows/${currentRun.id}/stop`, { method: 'POST' });
    renderRun(run);
  } catch (error) {
    showError(error.message);
  }
}

async function checkHealth() {
  try {
    const data = await requestJson('/api/health');
    health.textContent = data.ok ? '服务正常' : '服务异常';
  } catch {
    health.textContent = '服务未启动';
  }
}

async function loadConfig() {
  const data = await requestJson('/api/config');
  for (const [key, value] of Object.entries(data)) {
    const input = configForm.elements.namedItem(key);
    if (input && input.type !== 'password') input.value = value || '';
  }
  configStatus.textContent = '接口配置已读取';
}

configToggle.addEventListener('click', () => {
  const hidden = configBody.classList.toggle('hidden');
  configToggle.textContent = hidden ? '打开配置' : '收起配置';
});

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveConfigBtn.disabled = true;
  saveConfigBtn.textContent = '保存中';
  try {
    const data = await requestJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildConfigPayload())
    });
    for (const [key, value] of Object.entries(data)) {
      const input = configForm.elements.namedItem(key);
      if (input && input.type !== 'password') input.value = value || '';
    }
    configStatus.textContent = '保存成功';
  } catch (error) {
    configStatus.textContent = error.message;
  } finally {
    saveConfigBtn.disabled = false;
    saveConfigBtn.textContent = '保存配置';
  }
});

diagnoseBtn.addEventListener('click', async () => {
  diagnoseBtn.disabled = true;
  diagnoseBtn.textContent = '诊断中';
  try {
    const currentOnly = Boolean(diagnoseCurrentOnly?.checked);
    const data = await requestJson('/api/config/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentOnly })
    });
    renderDiagnosisResult(data?.results);
  } catch (error) {
    configStatus.textContent = error.message;
    configStatus.classList.remove('diagnoseGrid');
    configStatus.style.whiteSpace = 'pre-wrap';
  } finally {
    diagnoseBtn.disabled = false;
    diagnoseBtn.textContent = '诊断';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  syncChoice('genre');
  syncChoice('mood');
  showError('');
  submitBtn.disabled = true;
  submitBtn.textContent = '创建中';
  try {
    const run = await requestJson('/api/workflows', { method: 'POST', body: buildFormData() });
    renderRun(run);
    runMeta.textContent = '任务已创建。先生成歌词，满意后再点下一步。';
  } catch (error) {
    showError(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '创建任务';
  }
});

initChoiceInputs();
syncDurationValue();
durationInput?.addEventListener('input', syncDurationValue);
checkHealth();
loadConfig().catch((error) => {
  configStatus.textContent = error.message;
});
renderRun(null);
