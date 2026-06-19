(function () {
  const $ = (id) => document.getElementById(id);

  const el = {
    apiKeyBanner: $("apiKeyBanner"),
    imageFile: $("imageFile"),
    imagePreview: $("imagePreview"),
    uploaderInner: $("uploaderInner"),
    imageUrl: $("imageUrl"),
    prompt: $("prompt"),
    promptLen: $("promptLen"),
    cameraChips: $("cameraChips"),
    model: $("model"),
    resolution: $("resolution"),
    duration: $("duration"),
    promptOptimizer: $("promptOptimizer"),
    fastPretreatment: $("fastPretreatment"),
    aigcWatermark: $("aigcWatermark"),
    submitBtn: $("submitBtn"),
    resultBox: $("resultBox"),
    taskIdLine: $("taskIdLine"),
    taskIdCode: $("taskIdCode"),
    history: $("history"),
  };

  const HISTORY_KEY = "i2v_history_v1";
  let history = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch (_) {}

  let selectedImageData = null;

  // --- bootstrap config ---
  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg.api_key_set) el.apiKeyBanner.classList.remove("hidden");

      (cfg.camera_commands || []).forEach((cmd) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = cmd;
        chip.title = `点击在 prompt 中插入 [${cmd}]`;
        chip.addEventListener("click", () => {
          insertAtCursor(el.prompt, `[${cmd}]`);
        });
        el.cameraChips.appendChild(chip);
      });

      (cfg.models || []).forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        el.model.appendChild(opt);
      });
    })
    .catch(() => {
      el.apiKeyBanner.classList.remove("hidden");
    });

  // --- image handling ---
  const uploader = document.querySelector(".uploader");
  ["dragenter", "dragover"].forEach((evt) =>
    uploader.addEventListener(evt, (e) => { e.preventDefault(); uploader.style.borderColor = "var(--accent)"; })
  );
  ["dragleave", "drop"].forEach((evt) =>
    uploader.addEventListener(evt, (e) => { e.preventDefault(); uploader.style.borderColor = ""; })
  );
  uploader.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  el.imageFile.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  });
  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("请上传图片文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert("图片体积超过 20MB 限制");
      return;
    }
    selectedImageData = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      el.imagePreview.src = ev.target.result;
      el.imagePreview.hidden = false;
      el.uploaderInner.style.display = "none";
      el.imageUrl.value = "";
    };
    reader.readAsDataURL(file);
  }

  el.imageUrl.addEventListener("input", () => {
    if (el.imageUrl.value.trim()) {
      selectedImageData = null;
      el.imagePreview.src = "";
      el.imagePreview.hidden = true;
      el.uploaderInner.style.display = "";
    }
  });

  el.prompt.addEventListener("input", () => {
    el.promptLen.textContent = el.prompt.value.length;
  });

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const sep = before && !/\s$/.test(before) ? " " : "";
    textarea.value = before + sep + text + after;
    const pos = (before + sep + text).length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.dispatchEvent(new Event("input"));
    textarea.focus();
  }

  // --- submit ---
  el.submitBtn.addEventListener("click", async () => {
    const prompt = el.prompt.value.trim();
    if (!prompt) return alert("请填写 prompt");
    if (!selectedImageData && !el.imageUrl.value.trim()) {
      return alert("请上传图片或填写图片 URL");
    }

    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("model", el.model.value);
    fd.append("duration", el.duration.value);
    fd.append("resolution", el.resolution.value);
    fd.append("prompt_optimizer", el.promptOptimizer.checked ? "true" : "false");
    fd.append("fast_pretreatment", el.fastPretreatment.checked ? "true" : "false");
    fd.append("aigc_watermark", el.aigcWatermark.checked ? "true" : "false");
    if (selectedImageData) {
      fd.append("image", selectedImageData);
    } else {
      fd.append("image_url", el.imageUrl.value.trim());
    }

    el.submitBtn.disabled = true;
    el.submitBtn.textContent = "提交中...";
    setResultLoading("正在向 MiniMax 提交任务…");

    let task_id = null;
    try {
      const resp = await fetch("/api/generate", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok || !data.task_id) {
        throw new Error(data.detail || data.status_msg || data.raw || "生成失败");
      }
      task_id = data.task_id;
      el.taskIdLine.classList.remove("hidden");
      el.taskIdCode.textContent = task_id;
      pushHistory({
        task_id,
        prompt,
        model: el.model.value,
        status: "processing",
        thumb: el.imagePreview.src || el.imageUrl.value || null,
        createdAt: Date.now(),
      });
      await pollTask(task_id);
    } catch (err) {
      setResultError(err.message || String(err));
    } finally {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = "🎬 生成视频";
    }
  });

  async function pollTask(task_id) {
    setResultLoading("视频生成中，请耐心等待…（通常需要 30s~2 分钟）");
    const start = Date.now();
    const maxWait = 10 * 60 * 1000;
    while (Date.now() - start < maxWait) {
      await sleep(5000);
      try {
        const resp = await fetch(`/api/tasks/${encodeURIComponent(task_id)}`);
        const data = await resp.json();
        if (data.status === "success") {
          setResultSuccess(data);
          updateHistoryStatus(task_id, "success", data.video_url, data.file_id);
          return;
        }
        if (data.status === "failed") {
          setResultError(data.message || "生成失败");
          updateHistoryStatus(task_id, "failed");
          return;
        }
      } catch (err) {
        setResultError(String(err));
        return;
      }
    }
    setResultError("轮询超时，请稍后自行查询任务状态");
  }

  // --- result rendering ---
  function setResultLoading(text) {
    el.resultBox.classList.remove("empty");
    el.resultBox.innerHTML = `
      <div class="status-line"><div class="spinner"></div><span>${escapeHtml(text)}</span></div>
      <div class="hint-sm">任务成功后会自动显示视频播放窗口</div>
    `;
  }
  function setResultError(msg) {
    el.resultBox.classList.remove("empty");
    el.resultBox.innerHTML = `
      <div class="status-line" style="color:#fbc2c2;">❌ ${escapeHtml(msg)}</div>
      <div class="hint-sm">请检查 API Key、余额与参数是否符合模型要求</div>
    `;
  }
  function setResultSuccess(data) {
    el.resultBox.classList.remove("empty");
    const videoSrc = data.video_url || null;
    const fallbackLink = data.file_id ? `/api/download/${encodeURIComponent(data.file_id)}` : null;
    el.resultBox.innerHTML = `
      <div class="status-line" style="color:#b9f3c6;">✅ 生成成功！</div>
      ${videoSrc
        ? `<video class="result-video" controls autoplay playsinline src="${escapeAttr(videoSrc)}"></video>`
        : `<div class="hint-sm">（未能解析到可直接播放的视频 URL，请点击下方按钮下载）</div>`
      }
      <div class="result-actions">
        ${fallbackLink ? `<a class="btn-small" href="${escapeAttr(fallbackLink)}" target="_blank" rel="noopener">⬇️ 下载 MP4</a>` : ""}
        ${videoSrc ? `<a class="btn-small" href="${escapeAttr(videoSrc)}" target="_blank" rel="noopener">🌐 在新窗口打开</a>` : ""}
      </div>
    `;
  }

  // --- history ---
  function pushHistory(item) {
    history.unshift(item);
    if (history.length > 20) history = history.slice(0, 20);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
    renderHistory();
  }
  function updateHistoryStatus(task_id, status, video_url, file_id) {
    const it = history.find((h) => h.task_id === task_id);
    if (!it) return;
    it.status = status;
    if (video_url) it.video_url = video_url;
    if (file_id) it.file_id = file_id;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
    renderHistory();
  }
  function renderHistory() {
    if (!history.length) {
      el.history.innerHTML = `<div class="hint-sm" style="padding:1rem;">暂无任务</div>`;
      return;
    }
    el.history.innerHTML = history
      .map((h) => {
        const ts = new Date(h.createdAt).toLocaleString();
        const img = h.thumb ? `<img src="${escapeAttr(h.thumb)}" alt="thumb" />` : `<div class="big-icon" style="font-size:28px;">🖼️</div>`;
        const videoLink = h.video_url ? `<a class="btn-small" href="${escapeAttr(h.video_url)}" target="_blank" rel="noopener">播放</a>` : "";
        const downloadLink = h.file_id ? `<a class="btn-small" href="/api/download/${encodeURIComponent(h.file_id)}" target="_blank" rel="noopener">下载</a>` : "";
        return `
          <div class="history-item">
            ${img}
            <div>
              <div class="meta">${escapeHtml(h.prompt.slice(0, 80))}${h.prompt.length > 80 ? "…" : ""}</div>
              <div class="sub">${escapeHtml(h.model)} · ${ts}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
              <span class="badge ${h.status}">${h.status}</span>
              ${videoLink}${downloadLink}
            </div>
          </div>
        `;
      })
      .join("");
  }
  renderHistory();

  // --- utils ---
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
