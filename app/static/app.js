const $ = (selector) => document.querySelector(selector);
const keySlot = "fortebank-api-key", jobSlot = "fortebank-review-job";
const state = { file: null, contextId: null, key: sessionStorage.getItem(keySlot) || "", url: null, ready: false, checking: false, busy: false, result: null, details: null, connection: null, job: null, timer: null, started: 0 };
const video = $("#video-preview");
let rules = new Map();

function updateControls() {
  $("#open-result").disabled = !state.result;
  $("#refresh-readiness").hidden = !state.file;
  $("#refresh-readiness").disabled = state.checking;
  $("#refresh-readiness").textContent = state.checking ? "Проверяем связь…" : "Проверить подключение";
}
function stage(number) { $("#status-heading").textContent = ["Запись получена", "Проверка записи", "Проверка завершена"][number]; }
function showView(name) {
  if (name === "result") { video.pause(); if (!$("#report-dialog").open) $("#report-dialog").showModal(); }
  if (name === "record") { $("#report-dialog").close(); if (state.result) $("#status-text").textContent = "Можно просмотреть запись и перейти к событиям."; }
}
$("#open-result").addEventListener("click", () => showView("result"));
$("#close-report").addEventListener("click", () => showView("record"));
$("#open-rules").addEventListener("click", () => { video.pause(); $("#rules-dialog").showModal(); });
$("#close-rules").addEventListener("click", () => $("#rules-dialog").close());
const tooltip = $("#item-tooltip");
document.addEventListener("pointermove", (event) => {
  const target = event.target.closest("[data-tip]");
  if (!target) { tooltip.hidden = true; return; }
  if (event.pointerType === "touch" || localStorage.getItem("inventory-tooltips") === "off") return;
  tooltip.textContent = target.dataset.tip;
  tooltip.hidden = false;
  tooltip.style.left = `${Math.max(8, Math.min(event.clientX + 10, innerWidth - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = `${Math.max(8, event.clientY - tooltip.offsetHeight - 12)}px`;
});
for (const type of ["pointerleave", "click"]) document.addEventListener(type, () => { tooltip.hidden = true; });

function formatTime(seconds, tenths = true) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const ticks = Math.round(value * 10), minutes = Math.floor(ticks / 600), rest = Math.floor(ticks / 10) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}${tenths ? "." + ticks % 10 : ""}`;
}
function error(message) { $("#error-panel").hidden = false; $("#error-text").textContent = message; }
function missingContext(message) {
  $("#review-stage").hidden = true;
  $("#missing-context").hidden = false;
  $("#status-heading").textContent = "Энд";
  $("#status-text").textContent = "";
  if (message) $("#missing-message").textContent = message;
}
function attachVideo(file) {
  state.file = file;
  state.url = URL.createObjectURL(file);
  video.src = state.url;
  $("#file-name").textContent = file.name;
  $("#file-size").textContent = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} КБ` : `${(file.size / 1024 / 1024).toFixed(1)} МБ`;
  $("#review-stage").hidden = false;
  $("#open-rules").hidden = false;
}
video.addEventListener("loadedmetadata", () => { $("#video-format").textContent = `.MOV · ${formatTime(video.duration, false)}`; $("#video-fallback").hidden = true; });
video.addEventListener("error", () => { $("#play-recording").hidden = true; $("#video-fallback").hidden = false; });
video.addEventListener("play", () => { $("#play-recording").hidden = true; });
window.addEventListener("pagehide", () => { if (state.url) URL.revokeObjectURL(state.url); });
window.addEventListener("pageshow", (event) => { if (event.persisted && state.file) { state.url = URL.createObjectURL(state.file); video.src = state.url; } });

async function requestJSON(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = { 401: "Ключ отклонён сервером. Изменить его можно в инвентаре.", 404: "Задание не найдено или срок хранения результата истёк.", 413: "Размер файла превышает ограничение сервера.", 415: "Сервис принимает только видеофайлы .mov.", 503: "Сервис пока не готов к проверке. Проверьте подключение модели." };
      throw new Error(messages[response.status] || `Сервер вернул ошибку ${response.status}. Повторите попытку.`);
    }
    return payload;
  } catch (failure) {
    if (failure.name === "AbortError") throw new Error("Сервер не ответил вовремя. Можно повторно запросить результат.");
    if (failure instanceof TypeError) throw new Error("Нет связи с локальным сервером. Проверьте, запущено ли приложение.");
    throw failure;
  } finally { clearTimeout(timer); }
}

async function checkReadiness(showDialog = false) {
  if (state.checking) return false;
  state.checking = true;
  updateControls();
  if (showDialog) {
    $("#connection-checks").replaceChildren();
    $("#connection-message").textContent = "Проверяем сервер, ключ и анализатор…";
    $("#close-connection").disabled = true;
    $("#connection-dialog").showModal();
  }
  try {
    const health = await requestJSON("/api/v1/connection", {headers:{"X-API-Key":state.key}});
    state.connection = health;
    state.ready = health.ready === true;
    if (!showDialog) {
      $("#status-heading").textContent = state.ready ? "Запись готова к проверке" : "Ожидание анализатора";
      $("#status-text").textContent = health.message;
    }
    if (showDialog) {
      for (const [ok,label] of [[true,"Локальный сервер отвечает"],[true,"X-API ключ принят"],[state.ready,state.ready ? "Анализатор готов" : "Анализатор не готов"]]) {
        const row = node("li", ok ? "check-ok" : "check-wait", label); $("#connection-checks").append(row);
      }
      $("#connection-message").textContent = health.message;
      $("#close-connection").textContent = state.ready && !state.job && !state.busy ? "Начать проверку" : "Готово";
    }
    $("#preview-note").textContent = health.mode === "baseline" ? "Сейчас доступна проверка обзора камеры. Остальные кассовые действия пока не проверяются." : "Запись и ключ получены из инвентаря.";
  } catch (failure) {
    state.ready = false;
    if (showDialog) { $("#connection-message").textContent = failure.message; $("#close-connection").textContent = "Готово"; }
    else { $("#status-heading").textContent = "Нет соединения"; $("#status-text").textContent = failure.message; }
  } finally {
    state.checking = false;
    $("#close-connection").disabled = false;
    updateControls();
  }
  return state.ready;
}
$("#refresh-readiness").addEventListener("click", () => checkReadiness(true));
$("#close-connection").addEventListener("click", () => {
  $("#connection-dialog").close();
  if (state.ready && !state.job && !state.busy) run();
});

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function sourceLink(rule) {
  const link = node("a", "", `${rule.document}, ${rule.section}`);
  const url = new URL(rule.url);
  if (url.protocol === "https:" && (url.hostname === "adilet.zan.kz" || url.hostname.endsWith(".adilet.zan.kz") || url.hostname === "nationalbank.kz" || url.hostname.endsWith(".nationalbank.kz"))) link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

async function loadRules() {
  try {
    const [existing, extended] = await Promise.all([requestJSON("/api/v1/rules"), requestJSON("/api/v1/catalog").catch(() => ({rules:[]}))]);
    const catalog = [...existing, ...extended.rules.map(rule => ({...rule, document: rule.refs.filter(ref=>ref.verified).map(ref=>ref.source_title).filter((value,index,all)=>all.indexOf(value)===index).join("; ") || "Нормативное основание требует сверки", section: rule.refs.filter(ref=>ref.verified).map(ref=>ref.point).join("; "), url:rule.refs.find(ref=>ref.verified)?.url || rule.refs[0]?.url || "https://adilet.zan.kz", visibility_note:rule.hint}))];
    rules = new Map(catalog.map((rule) => [rule.title, rule]));
    $("#rules-list").replaceChildren();
    for (const rule of catalog) {
      const article = node("article", "rule");
      article.dataset.search = `${rule.title} ${rule.id} ${rule.visibility_note}`.toLocaleLowerCase("ru");
      article.append(node("h3", "", rule.title), sourceLink(rule), node("p", "muted", rule.visibility_note));
      if (rule.id.startsWith("V") || rule.id === "X00") article.append(node("p", "rule-state", rule.id === "V13" ? "Доступна базовая проверка обзора камеры" : "Тип из каталога OKO · детектор ещё не подключён"));
      $("#rules-list").append(article);
    }
    $("#rules-count").textContent = `${catalog.length} правил`;
  } catch {
    $("#rules-list").textContent = "Не удалось загрузить справочник. Обновите страницу после восстановления связи с сервером.";
  }
}
const rulesLoaded = loadRules();
$("#rules-search").addEventListener("input", event => {
  const query = event.target.value.trim().toLocaleLowerCase("ru"); let shown = 0;
  $("#rules-list").querySelectorAll(".rule").forEach(article => { article.hidden = !article.dataset.search.includes(query); if (!article.hidden) shown++; });
  $("#rules-count").textContent = `Найдено: ${shown}`;
});

function jumpButton(seconds, text) {
  const button = node("button", "time-jump", text || formatTime(seconds));
  button.type = "button";
  button.title = `Перейти к ${formatTime(seconds)} в видео`;
  button.addEventListener("click", () => {
    showView("record");
    if (!state.file || video.error || video.readyState === 0) {
      $("#preview-note").textContent = "Этот файл не воспроизводится в браузере. Кадры доступны во вкладке результата.";
      $("#preview-note").scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    video.pause();
    $("#play-recording").hidden = true;
    window.MinecraftPlayer.jump(seconds);
    video.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  return button;
}

function renderResult(result) {
  if (!["violation", "no_violation"].includes(result.verdict) || !Array.isArray(result.violations) || (result.verdict === "violation") !== (result.violations.length > 0)) throw new Error("Сервис вернул неполный результат. Проверка не может считаться завершённой.");
  state.result = result;
  const findings = result.violations;
  $("#result-panel").hidden = false;
  $("#result-summary").classList.toggle("has-findings", findings.length > 0);
  $("#verdict").textContent = findings.length ? "Обнаружены признаки возможных нарушений" : "Нарушение не обнаружено";
  $("#result-detail").textContent = findings.length ? `Событий для проверки: ${findings.length}. Сопоставьте кадры с описанием и правилом.` : state.details?.mode === "baseline" ? "Признаков перекрытия обзора камеры не найдено. Это результат только доступной базовой проверки." : "Модель не обнаружила признаков нарушения в этой записи. Вывод относится только к видимым действиям и возможностям подключённой модели.";
  if (!findings.length && state.details?.review?.length) $("#result-detail").textContent = `Срабатываний выше установленного порога нет. Эпизодов для ручной проверки: ${state.details.review.length}. Откройте вкладку «На проверку человеком».`;
  $("#analysis-scope").textContent = state.details?.scope || "";
  $("#analysis-scope").hidden = !state.details?.scope;
  if (state.details?.mode === "baseline") $("#preview-note").textContent = "Сейчас доступна проверка обзора камеры. Остальные кассовые действия пока не проверяются.";
  $("#analysis-meta").replaceChildren();
  if (state.details?.video) $("#analysis-meta").append(node("span", "", `Просмотрено: ${formatTime(state.details.coverage_sec, false)} / ${formatTime(state.details.video.duration_sec, false)}`), node("span", "", `Обработка: ${state.details.timings.total_sec} с`));
  for (const note of state.details?.notes || []) $("#analysis-meta").append(node("p", "", note));
  $("#violations").replaceChildren();
  $("#event-timeline").replaceChildren();
  $("#event-timeline").hidden = !findings.length;
  findings.forEach((item, index) => {
    const article = node("article", "violation");
    const heading = node("div", "event-heading");
    const title = node("div");
    title.append(node("p", "event-number", `СОБЫТИЕ ${String(index + 1).padStart(2, "0")}`), node("h3", "", item.type));
    heading.append(title, jumpButton(item.timecode_sec));
    const rule = rules.get(item.type);
    const extra = state.details?.findings?.[index];
    const observation = extra?.observed || (rule ? item.description.split(" Возможное несоответствие:")[0] : item.description);
    article.append(heading, node("p", "observation", observation));
    if (extra) article.append(node("p", "muted", `Оценка детектора: ${Math.round(extra.confidence*100)}/100 · ${extra.t_end != null ? `до ${formatTime(extra.t_end)}` : "один момент"}`));
    const source = node("div", "source-box");
    if (rule) {
      source.append(node("strong", "", "Правило и нормативный источник"), node("p"));
      source.lastChild.append(sourceLink(rule));
      source.append(node("p", "muted", rule.visibility_note));
    } else source.textContent = "Источник не сопоставлен со справочником. Проверьте обоснование в описании события; ссылка не подставляется автоматически.";
    article.append(source);
    const frames = node("div", "frames");
    for (const frame of item.evidence_frames || []) {
      const figure = node("figure");
      const open = node("button", "frame-open");
      open.type = "button";
      open.setAttribute("aria-label", `Увеличить кадр ${formatTime(frame.timestamp_sec)}`);
      const image = node("img");
      image.src = `data:image/jpeg;base64,${frame.image_base64}`;
      image.alt = `Кадр-доказательство: ${item.type}, ${formatTime(frame.timestamp_sec)}`;
      image.loading = "lazy";
      open.append(image);
      open.addEventListener("click", () => {
        $("#full-frame").src = image.src;
        $("#full-frame").alt = image.alt;
        $("#frame-caption").textContent = `${item.type} · ${formatTime(frame.timestamp_sec)}`;
        $("#frame-dialog").showModal();
      });
      const caption = node("figcaption", "", "Кадр ");
      caption.append(jumpButton(frame.timestamp_sec));
      figure.append(open, caption);
      frames.append(figure);
    }
    article.append(frames);
    $("#violations").append(article);
    $("#event-timeline").append(jumpButton(item.timecode_sec, `${index + 1} · ${formatTime(item.timecode_sec)}`));
  });
  renderReviewCandidates();
  window.MinecraftPlayer.setReport(state.details, findings);
  stage(2);
  showView("result");
  window.GameUI?.sound("levelup", .15);
}
$("#close-frame").addEventListener("click", () => $("#frame-dialog").close());
function renderReviewCandidates() {
  const candidates = state.details?.review || [], list = $("#review-candidates");
  list.replaceChildren();
  $("#report-tabs").hidden = !candidates.length;
  $("#show-review").textContent = `На проверку человеком (${candidates.length})`;
  $("#show-findings").textContent = `События (${state.result.violations.length})`;
  list.hidden = true; $("#violations").hidden = false;
  $("#show-findings").setAttribute("aria-pressed", "true"); $("#show-review").setAttribute("aria-pressed", "false");
  for (const candidate of candidates) {
    const article = node("article", "violation");
    const heading = node("div", "event-heading"); heading.append(node("h3", "", candidate.rule.title), jumpButton(candidate.timecode));
    article.append(heading, node("p", "observation", candidate.observed), node("p", "muted", candidate.review_reason), node("p", "muted", `Оценка детектора: ${Math.round(candidate.confidence * 100)}/100. Эта отметка не включена в вердикт.`));
    const frames = node("div", "frames");
    for (const frame of candidate.frames || []) {
      const figure = node("figure"), image = node("img"), open = node("button", "frame-open");
      image.src = `data:image/jpeg;base64,${frame.image_base64}`; image.alt = `На проверку: ${candidate.rule.title}`; image.loading = "lazy";
      open.type = "button"; open.setAttribute("aria-label", `Увеличить кадр ${formatTime(frame.timestamp_sec)}`); open.append(image);
      open.addEventListener("click", () => { $("#full-frame").src=image.src; $("#full-frame").alt=image.alt; $("#frame-caption").textContent=`На проверку человеком · ${formatTime(frame.timestamp_sec)}`; $("#frame-dialog").showModal(); });
      const caption=node("figcaption"); caption.append(jumpButton(frame.timestamp_sec)); figure.append(open,caption); frames.append(figure);
    }
    article.append(frames); list.append(article);
  }
}
for (const [button, review] of [["#show-findings",false],["#show-review",true]]) $(button).addEventListener("click", () => {
  $("#violations").hidden = review; $("#review-candidates").hidden = !review;
  $("#show-findings").setAttribute("aria-pressed", String(!review)); $("#show-review").setAttribute("aria-pressed", String(review));
});
$("#frame-dialog").addEventListener("click", (event) => { if (event.target === $("#frame-dialog")) $("#frame-dialog").close(); });
$("#export-report").addEventListener("click", () => {
  if (!state.result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" }));
  const link = node("a");
  link.href = url;
  link.download = `forte-result-${state.result.job_id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("#export-html").addEventListener("click", () => {
  if (!state.result) return;
  const content = $("#result-panel").cloneNode(true);
  content.querySelectorAll("#report-tabs").forEach(element => element.remove());
  content.querySelectorAll("button").forEach(button => { const text = document.createElement("span"); text.append(...button.childNodes); button.replaceWith(text); });
  content.querySelectorAll("[hidden]").forEach(element => element.hidden = false);
  content.querySelector("#result-icon")?.remove();
  const heading = node("h1", "", state.file.name);
  const report = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Отчёт проверки видео</title><style>body{font:16px/1.6 system-ui;margin:40px auto;max-width:1000px;padding:0 20px;color:#222}h1,h2,h3{line-height:1.3}.violation{border-top:2px solid #999;padding-top:18px;margin-top:24px}.frames{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;max-width:300px}img{max-width:100%}.muted,.result-footnote{color:#666;font-size:14px}.verdict{font-size:24px}.analysis-scope{background:#fff2cb;padding:12px}#review-candidates:not(:empty):before{content:'Отметки для проверки человеком';display:block;font-size:24px;margin-top:24px}@media print{.violation{break-inside:avoid}}</style><body>${heading.outerHTML}${content.outerHTML}</body></html>`;
  const url = URL.createObjectURL(new Blob([report], {type:"text/html;charset=utf-8"}));
  const link = node("a"); link.href=url; link.download=`forte-report-${state.result.job_id}.html`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  window.GameUI?.notify("Отчёт сохранён", "HTML с кадрами можно открыть без сервера");
});

function progress(message, percent = null) {
  $("#status-panel").hidden = false;
  $("#status-text").textContent = message;
  $("#boss-progress").classList.toggle("indeterminate", percent === null);
  $("#boss-progress").setAttribute("aria-label", percent === null ? "Анализ видео" : "Загрузка видео");
  if (percent === null) $("#boss-progress").removeAttribute("aria-valuenow");
  else $("#boss-progress").setAttribute("aria-valuenow", Math.round(percent));
  $("#boss-fill").style.width = percent === null ? "" : `${percent}%`;
}

function startClock(started) {
  state.started = started;
  $("#elapsed").hidden = false;
  clearInterval(state.timer);
  const tick = () => { $("#elapsed").textContent = `${formatTime(((state.job?.completed || Date.now()) - started) / 1000, false)} / 05:00`; };
  tick();
  state.timer = setInterval(tick, 1000);
}

function upload(file, key) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/v1/analyze");
    request.setRequestHeader("X-API-Key", key);
    request.timeout = Math.max(1, 300000 - (Date.now() - state.started));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = event.loaded / event.total * 100;
        progress(`Загрузка видео на локальный сервер: ${Math.round(percent)}%`, percent);
      }
    };
    request.onload = () => {
      let response = {};
      try { response = JSON.parse(request.responseText); } catch { /* Report the failed response below. */ }
      if (request.status === 202 && typeof response.job_id === "string") resolve(response.job_id);
      else reject(new Error(({401:"Ключ отклонён сервером. Изменить его можно в инвентаре.",413:"Файл превышает допустимый размер сервера.",415:"Выберите файл в формате .mov.",503:"Сервис ещё не настроен для проверки."})[request.status] || `Не удалось загрузить видео (${request.status}).`));
    };
    request.onerror = () => reject(new Error("Соединение прервалось при загрузке. Проверьте локальный сервер."));
    request.ontimeout = () => reject(new Error("Загрузка не завершилась за 5 минут."));
    const data = new FormData();
    data.append("file", file, file.name);
    request.send(data);
  });
}

async function monitor(job, key) {
  while (true) {
    const result = await requestJSON(`/api/v1/jobs/${encodeURIComponent(job.id)}`, { headers: { "X-API-Key": key } });
    if (result.status === "done") {
      try { const details = await requestJSON(`/api/v1/jobs/${encodeURIComponent(job.id)}/details`, {headers:{"X-API-Key":key}}); state.details = details.result || null; }
      catch { state.details = (state.connection?.mode || job.mode) === "baseline" ? {mode:"baseline",scope:"Проверен только обзор камеры. Подробности анализа временно недоступны."} : null; }
      await rulesLoaded;
      renderResult(result);
      if (!job.completed) { job.completed = Date.now(); sessionStorage.setItem(jobSlot, JSON.stringify(job)); }
      progress("Проверка завершена. Результат доступен.", 100);
      $("#boss-progress").setAttribute("aria-label", "Проверка завершена");
      $("#resume-check").hidden = true;
      return;
    }
    if (result.status === "failed") {
      state.job = null;
      sessionStorage.removeItem(jobSlot);
      const message = /not been connected|unconfigured/i.test(result.error || "") ? "Модель анализа ещё не подключена." : /timeout|timed out/i.test(result.error || "") ? "Сервис не успел обработать запись за отведённое время." : "Сервис не смог обработать запись. Проверьте формат видео и подключение модели.";
      throw new Error(`${message} Вердикт по видео не сформирован.`);
    }
    if (result.status !== "processing") throw new Error("Сервер вернул неизвестный статус проверки.");
    if (Date.now() - job.started >= 300000) throw new Error("Результат не получен за 5 минут. Это незавершённая проверка; можно запросить результат повторно.");
    try {
      const details = await requestJSON(`/api/v1/jobs/${encodeURIComponent(job.id)}/details`, {headers:{"X-API-Key":key}});
      const label = {decode:"Чтение записи…",detect:"Проверка кадров…",evidence:"Подготовка кадров событий…",done:"Подготовка результата…"}[details.stage];
      if (details.status === "queued") progress(`Запись в очереди. Позиция: ${details.queue_position}.`);
      else progress(label || "Видео обрабатывается…", Number.isFinite(details.progress) ? details.progress : null);
    } catch { progress("Видео обрабатывается. Ожидаем обновление статуса…"); }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function run(resume = false) {
  if (state.busy || !state.file || !state.key || (!resume && !state.ready)) return;
  state.busy = true;
  $("#error-panel").hidden = true;
  $("#resume-check").hidden = true;
  if (!resume) {
    state.result = null;
    state.job = null;
    sessionStorage.removeItem(jobSlot);
    $("#result-panel").hidden = $("#event-timeline").hidden = true;
    $("#violations").replaceChildren();
    $("#event-timeline").replaceChildren();
  }
  updateControls();
  stage(1);
  startClock(resume ? state.job.started : Date.now());
  progress("Подключение к проверке…", 0);
  try {
    await requestJSON("/api/v1/auth/check", { headers: { "X-API-Key": state.key } });
    if (!resume) {
      progress("Загрузка выбранной записи…", 0);
      const id = await upload(state.file, state.key);
      state.job = { id, contextId: state.contextId, started: state.started, name: state.file.name, mode: state.connection?.mode };
      sessionStorage.setItem(jobSlot, JSON.stringify(state.job));
    }
    await monitor(state.job, state.key);
  } catch (failure) {
    error(failure.message || "Проверка не завершена.");
    $("#status-heading").textContent = "Проверка приостановлена";
    progress("Вердикт пока не получен.", 0);
    $("#resume-check").textContent = state.job ? "Проверить результат" : "Повторить проверку";
    $("#resume-check").hidden = false;
  } finally {
    clearInterval(state.timer);
    state.busy = false;
    updateControls();
  }
}
$("#resume-check").addEventListener("click", () => run(Boolean(state.job)));

async function initialize() {
  let context;
  try { context = await window.VideoTransfer.load(); }
  catch { missingContext("Не удалось восстановить запись. Вернитесь в инвентарь."); return; }
  if (!context || !state.key || sessionStorage.getItem("fortebank-craft-ready") !== context.id) { missingContext(); return; }
  state.contextId = context.id;
  attachVideo(context.file);
  try {
    const job = JSON.parse(sessionStorage.getItem(jobSlot));
    if (job && job.contextId === context.id && /^[a-zA-Z0-9_-]+$/.test(job.id) && Number.isFinite(job.started)) state.job = job;
    else sessionStorage.removeItem(jobSlot);
  } catch { sessionStorage.removeItem(jobSlot); }
  if (state.job) {
    state.ready = true;
    await run(true);
  } else if (await checkReadiness()) await run();
  updateControls();
}
initialize();
