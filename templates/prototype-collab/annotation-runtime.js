(() => {
  "use strict";
  if (window.__AIPM_ANNOTATION_RUNTIME__) return;
  window.__AIPM_ANNOTATION_RUNTIME__ = true;

  const script = document.currentScript;
  const project = script?.dataset.aipmProject || document.title || "prototype";
  const specHash = script?.dataset.aipmSpecHash || "";
  const params = new URLSearchParams(location.search);
  const routeParams = new URLSearchParams(params);
  routeParams.delete("aipm_rev");
  const routeQuery = routeParams.toString();
  const routeKey = (routeQuery ? `?${routeQuery}` : "") + location.hash;
  const route = location.pathname + routeKey;
  let routeMap = {};
  try { routeMap = JSON.parse(script?.dataset.aipmRouteMap || "{}"); } catch (_) {}
  const mapped = routeMap[routeKey] || {};
  const pageId = document.body.dataset.aipmPage || mapped.page_id || params.get("view") || location.pathname.split("/").pop() || "page";
  const stateId = document.body.dataset.aipmState || mapped.state_id || params.get("scenario") || "default";
  const frame = `${pageId}::${stateId}`;
  const knownFrames = new Set(Object.values(routeMap).filter(value => value && typeof value === "object").map(value => `${value.page_id || ""}::${value.state_id || ""}`));
  knownFrames.add(frame);
  const storageKey = `aipm:annotations:${project}:${specHash}`;
  let state = { items: [] };
  try { state = JSON.parse(localStorage.getItem(storageKey) || '{"items":[]}'); } catch (_) {}
  if (!Array.isArray(state.items)) state.items = [];
  let placing = false;

  const host = document.createElement("div");
  host.id = "aipm-annotation-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>/* AIPM_ANNOTATION_STYLE */</style>
    <div class="launcher"><button class="btn primary" id="place"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>添加标签</button><button class="btn" id="open">标签列表 <span id="count">0</span></button></div>
    <section class="panel hidden" id="panel"><div class="head"><strong>页面标注</strong><button id="close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="tools"><button class="btn" id="export">导出</button><button class="btn" id="import">导入</button><button class="sync-state" id="syncState" type="button" role="status" aria-live="polite" title="点击重试同步">浏览器草稿</button><input type="file" id="file" accept="application/json" hidden></div><div class="list" id="list"></div></section>
    <div id="pins"></div><div class="hint hidden" id="hint">点击页面元素或位置添加标签，Esc 取消</div>`;

  const $ = id => root.getElementById(id);
  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const cssEscape = value => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  function selector(element) {
    if (element.dataset?.aipmId) return `[data-aipm-id="${cssEscape(element.dataset.aipmId)}"]`;
    if (element.id) return `#${cssEscape(element.id)}`;
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const classes = [...current.classList].filter(name => !name.startsWith("aipm-")).slice(0, 2);
      if (classes.length) part += classes.map(name => `.${cssEscape(name)}`).join("");
      const siblings = current.parentElement ? [...current.parentElement.children].filter(node => node.tagName === current.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(">");
  }

  function anchorFor(element, x, y) {
    const stable = element.closest("[data-aipm-id]");
    const target = stable || element;
    const rect = target.getBoundingClientRect();
    return {
      strategy: stable ? "stable-id" : "selector",
      stable_id: stable?.dataset.aipmId || "",
      selector: selector(target),
      text: (target.innerText || target.textContent || "").trim().slice(0, 160),
      x_ratio: Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width))),
      y_ratio: Math.max(0, Math.min(1, (y - rect.top) / Math.max(1, rect.height))),
      page_x_ratio: x / document.documentElement.clientWidth,
      page_y_ratio: (y + scrollY) / Math.max(1, document.documentElement.scrollHeight)
    };
  }

  function resolveAnchor(item) {
    const anchor = item.anchor || {};
    let element = null;
    if (anchor.stable_id) element = document.querySelector(`[data-aipm-id="${cssEscape(anchor.stable_id)}"]`);
    if (!element && anchor.selector) {
      try { element = document.querySelector(anchor.selector); } catch (_) {}
    }
    return { element, drift: !element };
  }

  function positionPin(pin, item) {
    const found = resolveAnchor(item);
    if (found.element) {
      const rect = found.element.getBoundingClientRect();
      pin.style.left = `${rect.left + (item.anchor.x_ratio || 0.5) * rect.width - 13}px`;
      pin.style.top = `${rect.top + (item.anchor.y_ratio || 0.5) * rect.height - 13}px`;
      if (item.status === "anchor-drift") item.status = "open";
    } else {
      pin.style.left = `${(item.anchor.page_x_ratio || 0.5) * innerWidth - 13}px`;
      pin.style.top = `${(item.anchor.page_y_ratio || 0.5) * document.documentElement.scrollHeight - scrollY - 13}px`;
      item.status = "anchor-drift";
      pin.classList.add("anchor-drift");
    }
    pin.title = item.status === "anchor-drift" ? `定位已漂移：${item.comment}` : item.comment;
  }

  function setSyncState(text, kind = "draft") {
    const el = $("syncState");
    if (!el) return;
    el.textContent = text;
    el.dataset.state = kind;
  }

  async function syncProject() {
    try {
      const response = await fetch("/__aipm_feedback__", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schema_version: 1, project, spec_hash: specHash, stage: "annotation", exported_at: new Date().toISOString(), items: state.items }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSyncState("已同步项目", "synced");
      return true;
    } catch (_) {
      setSyncState("同步失败，可重试或导出", "failed");
      return false;
    }
  }

  async function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    setSyncState("浏览器草稿", "draft");
    render();
    window.parent?.postMessage({ type: "aipm:annotations-changed", frame, count: state.items.filter(item => item.page_id === pageId && item.state_id === stateId).length }, "*");
    await syncProject();
  }

  function labelFor(type) {
    return ({ "feature-note": "功能说明", "change-request": "修改意见", "question": "问题", "review-comment": "评审评论" })[type] || type;
  }

  function render() {
    const own = state.items.filter(item => item.page_id === pageId && item.state_id === stateId);
    $("count").textContent = own.length;
    $("list").innerHTML = own.length ? "" : '<div class="empty"><strong>把意见留在具体位置</strong><p>点击“添加标签”，再点选页面中的元素，即可记录说明或修改意见。</p></div>';
    $("pins").innerHTML = "";
    own.forEach((item, index) => {
      const row = document.createElement("button");
      row.className = `item ${item.feedback_type} ${item.status === "resolved" ? "resolved" : ""}`;
      const replies = (item.replies || []).length ? ` · ${(item.replies || []).length} 条回复` : "";
      row.innerHTML = `<span class="meta"><span>#${index + 1} ${labelFor(item.feedback_type)}${replies}</span><span>${escapeHtml(({open:"待处理",resolved:"已解决",reopened:"重新打开","pending-review":"待复核","anchor-drift":"位置待确认"})[item.status] || item.status)}</span></span><span class="item-content">${escapeHtml(item.comment)}</span>`;
      row.onclick = () => openForm(item, null);
      $("list").appendChild(row);

      const pin = document.createElement("button");
      pin.className = `pin ${item.feedback_type} ${item.status === "resolved" ? "resolved" : ""}`;
      pin.textContent = String(index + 1);
      pin.onclick = () => { openForm(item, null); $("panel").classList.remove("hidden"); };
      $("pins").appendChild(pin);
      positionPin(pin, item);
    });
  }

  function stopPlacing() {
    placing = false;
    $("hint").classList.add("hidden");
    document.documentElement.style.cursor = "";
  }

  function openForm(item, anchor) {
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const box = document.createElement("div");
    box.className = "form";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", item ? "编辑标签" : "添加页面标签");
    const previousFocus = root.activeElement || document.activeElement;
    const toggle = item ? `<button class="btn ${item.status === "resolved" ? "" : "danger"}" id="toggle">${item.status === "resolved" ? "重新打开" : "标记已解决"}</button>` : "";
    const remove = item ? '<button class="btn danger" id="remove">删除标签</button>' : "";
    const thread = item ? `<div class="thread">${(item.replies || []).map(reply => `<div class="reply"><strong>${escapeHtml(reply.author || "评审者")}</strong><span>${escapeHtml(reply.text)}</span></div>`).join("")}</div><div class="reply-compose"><input id="reply" placeholder="回复这条标签"><button class="btn" id="addReply">回复</button></div>` : "";
    box.innerHTML = `<h3>${item ? "编辑标签" : "添加页面标签"}</h3><label>类型<select id="type"><option value="feature-note">功能说明</option><option value="review-comment">评审评论</option><option value="change-request">修改意见</option><option value="question">问题</option></select></label><label>内容<textarea id="comment" placeholder="说明功能，或写清要修改什么"></textarea></label>${thread}<div class="actions">${toggle}${remove}<button class="btn" id="cancel">取消</button><button class="btn primary" id="save">保存</button></div>`;
    root.append(backdrop, box);
    const get = id => box.querySelector(`#${id}`);
    get("type").value = item?.feedback_type || "review-comment";
    get("comment").value = item?.comment || "";
    const close = () => { backdrop.remove(); box.remove(); previousFocus?.focus(); };
    box.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      if (event.key === "Tab") {
        const fields = [...box.querySelectorAll("button,input,select,textarea")];
        const first = fields[0], last = fields[fields.length - 1];
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    get("comment").focus();
    if (get("reply")) get("reply").setAttribute("aria-label", "回复这条标签");
    get("cancel").onclick = close;
    backdrop.onclick = close;
    if (item) {
      get("toggle").onclick = () => { item.status = item.status === "resolved" ? "reopened" : "resolved"; item.updated_at = new Date().toISOString(); close(); save(); };
      get("remove").onclick = () => {
        if (!window.confirm("确定删除这条页面标签吗？删除后不可恢复。")) return;
        const index = state.items.indexOf(item);
        if (index >= 0) state.items.splice(index, 1);
        close();
        save();
      };
      get("addReply").onclick = () => {
        const text = get("reply").value.trim();
        if (!text) return;
        item.replies = item.replies || [];
        item.replies.push({ reply_id: `reply-${Date.now()}`, author: "评审者", text, created_at: new Date().toISOString() });
        item.updated_at = new Date().toISOString();
        close(); save(); openForm(item, null);
      };
    }
    get("save").onclick = () => {
      const comment = get("comment").value.trim();
      if (!comment) { get("comment").focus(); return; }
      const now = new Date().toISOString();
      const payload = {
        feedback_id: item?.feedback_id || `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        feedback_type: get("type").value,
        page_id: pageId,
        state_id: stateId,
        target_id: anchor?.stable_id || item?.target_id || "",
        status: item?.status || "open",
        category: get("type").value === "change-request" ? "interaction" : "other",
        severity: get("type").value === "feature-note" ? "info" : "minor",
        title: item?.title || "",
        comment,
        expected: item?.expected || "",
        doc_refs: item?.doc_refs || [],
        replies: item?.replies || [],
        anchor: anchor || item?.anchor || { strategy: "frame" },
        route,
        created_at: item?.created_at || now,
        updated_at: now
      };
      if (item) Object.assign(item, payload); else state.items.push(payload);
      close();
      save();
    };
  }

  function captureClick(event) {
    if (!placing || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor = anchorFor(event.target, event.clientX, event.clientY);
    stopPlacing();
    openForm(null, anchor);
  }

  document.addEventListener("click", captureClick, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") stopPlacing(); });
  $("place").onclick = () => { placing = true; $("hint").classList.remove("hidden"); $("panel").classList.add("hidden"); document.documentElement.style.cursor = "crosshair"; };
  $("open").onclick = () => $("panel").classList.toggle("hidden");
  $("close").onclick = () => $("panel").classList.add("hidden");
  $("syncState").onclick = () => syncProject();
  $("export").onclick = () => {
    const payload = { schema_version: 1, project, spec_hash: specHash, stage: "annotation", exported_at: new Date().toISOString(), items: state.items };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = "annotations.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };
  $("import").onclick = () => $("file").click();
  $("file").onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (incoming.project !== project || incoming.spec_hash !== specHash) throw new Error("project-or-spec-mismatch");
      if (incoming.stage !== "annotation" || !Array.isArray(incoming.items)) throw new Error("items");
      const allowedTypes = new Set(["feature-note", "review-comment", "change-request", "question"]);
      const allowedStatuses = new Set(["open", "in-progress", "pending-review", "resolved", "reopened", "anchor-drift"]);
      if (incoming.items.some(item => !item || typeof item.feedback_id !== "string" || typeof item.page_id !== "string" || typeof item.state_id !== "string" || typeof item.comment !== "string" || !knownFrames.has(`${item.page_id}::${item.state_id}`) || !allowedTypes.has(item.feedback_type) || !allowedStatuses.has(item.status))) throw new Error("invalid-item");
      const ids = new Set(state.items.map(item => item.feedback_id));
      incoming.items.forEach(item => { if (!ids.has(item.feedback_id)) state.items.push(item); });
      await save();
    } catch (_) { alert("无法导入：项目、规格版本或条目格式不匹配"); }
    event.target.value = "";
  };
  addEventListener("scroll", render, { passive: true });
  addEventListener("resize", render);
  render();
  window.parent?.postMessage({ type: "aipm:annotations-changed", frame, count: state.items.filter(item => item.page_id === pageId && item.state_id === stateId).length }, "*");
})();
