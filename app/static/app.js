const form = document.querySelector("#upload-form");
const apiKeyInput = document.querySelector("#api-key");
const fileInput = document.querySelector("#video-file");
const submitButton = document.querySelector("#submit-button");
const statusPanel = document.querySelector("#status-panel");
const statusText = document.querySelector("#status-text");
const resultPanel = document.querySelector("#result-panel");
const verdict = document.querySelector("#verdict");
const violationsContainer = document.querySelector("#violations");
const readinessPanel = document.querySelector("#readiness-panel");
const readinessText = document.querySelector("#readiness-text");

fetch("/healthz")
  .then((response) => response.json())
  .then(({ ready }) => {
    if (ready) {
      submitButton.disabled = false;
    } else {
      readinessText.textContent = "Модель анализа пока не подключена. Загрузка будет доступна после её подключения.";
      readinessPanel.classList.remove("hidden");
    }
  })
  .catch(() => {
    readinessText.textContent = "Не удалось проверить готовность сервиса. Обновите страницу позже.";
    readinessPanel.classList.remove("hidden");
  });

let rulesByTitle = new Map();
fetch("/api/v1/rules")
  .then((response) => response.json())
  .then((rules) => { rulesByTitle = new Map(rules.map((rule) => [rule.title, rule])); })
  .catch(() => {});

function showStatus(message) {
  statusPanel.classList.remove("hidden");
  statusText.textContent = message;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remaining}`;
}

function renderResult(result) {
  resultPanel.classList.remove("hidden");
  violationsContainer.replaceChildren();
  verdict.textContent = result.verdict === "violation"
    ? "Обнаружены признаки возможных нарушений"
    : "Нарушение не обнаружено";

  for (const item of result.violations || []) {
    const article = document.createElement("article");
    article.className = "violation";
    const title = document.createElement("h3");
    title.textContent = item.type;
    const time = document.createElement("p");
    time.className = "time";
    time.textContent = `Время: ${formatTime(item.timecode_sec)}`;
    const description = document.createElement("p");
    description.textContent = item.description;
    article.append(title, time, description);

    const rule = rulesByTitle.get(item.type);
    if (rule) {
      const source = document.createElement("p");
      source.className = "source";
      const link = document.createElement("a");
      link.href = rule.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${rule.document}, ${rule.section}`;
      source.append("Источник: ", link);
      article.append(source);
    }

    const frames = document.createElement("div");
    frames.className = "frames";
    for (const frame of item.evidence_frames || []) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = `data:image/jpeg;base64,${frame.image_base64}`;
      image.alt = `Кадр на ${formatTime(frame.timestamp_sec)}`;
      const caption = document.createElement("figcaption");
      caption.textContent = `Кадр: ${formatTime(frame.timestamp_sec)}`;
      figure.append(image, caption);
      frames.append(figure);
    }
    article.append(frames);
    violationsContainer.append(article);
  }
}

async function pollJob(jobId, apiKey) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`/api/v1/jobs/${jobId}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Не удалось получить результат (${response.status}).`);
    const job = await response.json();
    if (job.status === "done") {
      showStatus("Обработка завершена.");
      renderResult(job);
      return;
    }
    if (job.status === "failed") throw new Error(job.error || "Не удалось обработать видео.");
    showStatus("Видео обрабатывается…");
  }
  throw new Error("Результат не получен за 5 минут.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value;
  const file = fileInput.files[0];
  if (!apiKey || !file) return;
  submitButton.disabled = true;
  resultPanel.classList.add("hidden");
  showStatus("Загрузка видео…");
  try {
    const data = new FormData();
    data.append("file", file);
    const response = await fetch("/api/v1/analyze", {
      method: "POST",
      headers: { "X-API-Key": apiKey },
      body: data,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || `Ошибка загрузки (${response.status}).`);
    }
    const { job_id: jobId } = await response.json();
    showStatus("Видео поставлено в очередь…");
    await pollJob(jobId, apiKey);
  } catch (error) {
    showStatus(error.message || "Произошла ошибка.");
  } finally {
    submitButton.disabled = false;
  }
});
