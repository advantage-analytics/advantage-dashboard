/* @ds-bundle: {"format":4,"namespace":"AdvantageDesignSystemV2_932d14","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"FormPills","sourcePath":"components/data/FormPills.jsx"},{"name":"InsightStatChip","sourcePath":"components/data/InsightStatChip.jsx"},{"name":"KpiTile","sourcePath":"components/data/KpiTile.jsx"},{"name":"KpiStrip","sourcePath":"components/data/KpiTile.jsx"},{"name":"StatusChip","sourcePath":"components/data/StatusChip.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Eyebrow","sourcePath":"components/display/Eyebrow.jsx"},{"name":"Kbd","sourcePath":"components/display/Kbd.jsx"},{"name":"Skeleton","sourcePath":"components/display/Skeleton.jsx"},{"name":"Tooltip","sourcePath":"components/display/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Dialog","sourcePath":"components/overlays/Dialog.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"c3ffb1f89a0d","components/actions/IconButton.jsx":"b8ead7615e72","components/data/FormPills.jsx":"512ac209462d","components/data/InsightStatChip.jsx":"8e21aac08c6c","components/data/KpiTile.jsx":"0204fd9d9cd3","components/data/StatusChip.jsx":"5a1899e3a087","components/display/Badge.jsx":"aabb6d6d9e3d","components/display/Card.jsx":"f83b2d85468a","components/display/Eyebrow.jsx":"1a89eb5d4523","components/display/Kbd.jsx":"1ab84c564ff5","components/display/Skeleton.jsx":"44d73e23ecc4","components/display/Tooltip.jsx":"3f3ce3a25a33","components/forms/Checkbox.jsx":"8c88d3de78c3","components/forms/Input.jsx":"7988631ac8ff","components/forms/Select.jsx":"30cd6b1a0302","components/forms/Switch.jsx":"3f9592f1f96c","components/forms/Textarea.jsx":"510f4891b4a4","components/navigation/Breadcrumb.jsx":"924cbbbcec4a","components/navigation/SidebarNav.jsx":"eacdd6767667","components/navigation/Tabs.jsx":"8a9c491bd71b","components/overlays/Dialog.jsx":"b22cce76e5ef","ui_kits/dashboard/HomeScreen.jsx":"f128678e4af9","ui_kits/dashboard/LoginScreen.jsx":"bece476a84d5","ui_kits/dashboard/MatchReportScreen.jsx":"cddcea53b711","ui_kits/dashboard/MatchesScreen.jsx":"429e758624a9","ui_kits/dashboard/Shell.jsx":"8a164d760720"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AdvantageDesignSystemV2_932d14 = window.AdvantageDesignSystemV2_932d14 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
const css = `
.adv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;cursor:pointer;font-family:var(--font-sans);font-weight:500;white-space:nowrap;border-radius:var(--radius-button);transition:background-color var(--duration-hover),color var(--duration-hover),border-color var(--duration-hover),box-shadow var(--duration-hover),transform 80ms ease-out;outline:none}
.adv-btn:focus-visible{box-shadow:var(--focus-ring)}
.adv-btn:active:not(:disabled){transform:scale(0.97)}
.adv-btn:disabled{opacity:0.5;pointer-events:none}
.adv-btn-sm{height:32px;padding:0 12px;font-size:12px}
.adv-btn-md{height:36px;padding:0 16px;font-size:13px}
.adv-btn-lg{height:44px;padding:0 20px;font-size:13px;letter-spacing:1px}
.adv-btn-pill{height:auto;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;border-radius:var(--radius-pill)}
.adv-btn-primary{background:var(--blue);color:#fff;box-shadow:var(--shadow-cta-glow)}
.adv-btn-primary:hover{background:var(--blue-hover)}
.adv-btn-primary.adv-btn-pill{box-shadow:none}
.adv-btn-outline{background:var(--surface-card);border-color:var(--border-field);color:var(--ink-700)}
.adv-btn-outline:hover{background:var(--surface-subtle);color:var(--blue);border-color:var(--blue-ring-30)}
.adv-btn-ghost{background:transparent;border-color:var(--border-field);color:var(--ink-700)}
.adv-btn-ghost:hover{background:var(--surface-subtle)}
.adv-btn-danger{background:transparent;border-color:var(--danger-tint-15);color:var(--danger)}
.adv-btn-danger:hover{background:var(--danger-tint-15)}
.adv-btn-danger-solid{background:var(--danger);color:#fff}
.adv-btn-danger-solid:hover{background:var(--danger-hover)}
@media (prefers-reduced-motion:reduce){.adv-btn:active:not(:disabled){transform:none}}`;
if (typeof document !== "undefined" && !document.getElementById("adv-btn-css")) {
  const s = document.createElement("style");
  s.id = "adv-btn-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Advantage action button. Primary = Signal Blue, one per surface. */
function Button({
  variant = "primary",
  size = "md",
  pill = false,
  disabled = false,
  children,
  onClick,
  type = "button",
  style,
  className = ""
}) {
  const v = variant === "danger-solid" ? "adv-btn-danger-solid" : `adv-btn-${variant}`;
  const s = pill ? "adv-btn-pill" : `adv-btn-${size}`;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: style,
    className: `adv-btn ${v} ${s} ${className}`
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
const css = `
.adv-iconbtn{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;cursor:pointer;border-radius:var(--radius-element);color:var(--nav-fg);transition:color var(--duration-fast),background-color var(--duration-fast),transform 80ms ease-out;outline:none}
.adv-iconbtn:hover{color:var(--nav-fg-hover);background:var(--surface-subtle)}
.adv-iconbtn:active{transform:scale(0.97)}
.adv-iconbtn:focus-visible{box-shadow:var(--focus-ring)}
.adv-iconbtn-sm{height:28px;width:28px}
.adv-iconbtn-md{height:32px;width:32px}`;
if (typeof document !== "undefined" && !document.getElementById("adv-iconbtn-css")) {
  const s = document.createElement("style");
  s.id = "adv-iconbtn-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Square chrome icon button (modal close, header controls). Never rounded-full. */
function IconButton({
  size = "sm",
  label,
  children,
  onClick,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    onClick: onClick,
    style: style,
    className: `adv-iconbtn adv-iconbtn-${size} ${className}`
  }, children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/FormPills.jsx
try { (() => {
const css = `
.adv-formrow{display:inline-flex;gap:5px;align-items:center}
.adv-formtick{width:2px;height:12px;border-radius:1px;display:inline-block}
.adv-formtick-w{background:var(--success)}
.adv-formtick-l{background:var(--danger)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-formpill-css")) {
  const s = document.createElement("style");
  s.id = "adv-formpill-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Recent-form strip: 2×12px outcome ticks, oldest → newest. */
function FormPills({
  results = [],
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `adv-formrow ${className}`,
    style: style,
    "aria-label": `Recent form: ${results.join(", ")}`
  }, results.map((r, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: `adv-formtick ${String(r).toUpperCase() === "W" ? "adv-formtick-w" : "adv-formtick-l"}`
  })));
}
Object.assign(__ds_scope, { FormPills });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/FormPills.jsx", error: String((e && e.message) || e) }); }

// components/data/InsightStatChip.jsx
try { (() => {
const css = `
.adv-statchip{display:inline-flex;align-items:baseline;gap:7px;font-family:var(--font-sans);line-height:1}
.adv-statchip-label{font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400);white-space:nowrap}
.adv-statchip-value{font-size:12px;font-weight:400;font-variant-numeric:tabular-nums;color:var(--ink-900)}
.adv-statchip-trend{font-size:10px;font-weight:500;font-variant-numeric:tabular-nums}`;
if (typeof document !== "undefined" && !document.getElementById("adv-statchip-css")) {
  const s = document.createElement("style");
  s.id = "adv-statchip-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Bare evidence stat beside AI prose — pure type, no container; real computed numbers, never LLM text. */
function InsightStatChip({
  label,
  value,
  change,
  lowerIsBetter = false,
  className = "",
  style
}) {
  const hasTrend = typeof change === "number" && change !== 0;
  const isGood = lowerIsBetter ? change < 0 : change > 0;
  return /*#__PURE__*/React.createElement("span", {
    className: `adv-statchip ${className}`,
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-statchip-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "adv-statchip-value"
  }, value), hasTrend && /*#__PURE__*/React.createElement("span", {
    className: "adv-statchip-trend",
    style: {
      color: isGood ? "var(--success)" : "var(--danger)"
    }
  }, change > 0 ? "↑" : "↓", Math.abs(change)));
}
Object.assign(__ds_scope, { InsightStatChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/InsightStatChip.jsx", error: String((e && e.message) || e) }); }

// components/data/KpiTile.jsx
try { (() => {
const css = `
.adv-kpi-strip{display:flex;flex-wrap:wrap;background:var(--surface-card);border:1px solid var(--border-card);border-radius:var(--radius-card);box-shadow:var(--shadow-card);overflow:hidden;font-family:var(--font-sans)}
.adv-kpi{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;padding:20px;overflow:hidden;transition:background-color var(--duration-hover)}
.adv-kpi-link{cursor:pointer}
.adv-kpi-link:hover{background:var(--surface-muted)}
.adv-kpi-label{font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400);white-space:nowrap}
.adv-kpi-row{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;row-gap:6px;min-width:0}
.adv-kpi-value{font-size:28px;font-weight:300;letter-spacing:-0.5px;line-height:1;color:var(--ink-900);font-variant-numeric:tabular-nums;white-space:nowrap}
.adv-kpi-trend{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;font-variant-numeric:tabular-nums}
.adv-kpi-trend-label{font-size:10px;font-weight:400;color:var(--ink-500)}
.adv-kpi-hint{font-size:10px;color:var(--ink-400)}
.adv-kpi-spark{margin-left:auto;flex-shrink:0}`;
if (typeof document !== "undefined" && !document.getElementById("adv-kpi-css")) {
  const s = document.createElement("style");
  s.id = "adv-kpi-css";
  s.textContent = css;
  document.head.appendChild(s);
}
let __advSparkSeq = 0;
function Sparkline({
  data,
  positive
}) {
  const w = 80,
    h = 28,
    pad = 2;
  const color = positive ? "var(--success)" : "var(--danger)";
  if (!data || data.length < 2) return null;
  const min = Math.min(...data),
    max = Math.max(...data),
    range = max - min || 1;
  const ptArr = data.map((v, i) => ({
    x: pad + i / (data.length - 1) * (w - pad * 2),
    y: h - pad - (v - min) / range * (h - pad * 2)
  }));
  const pts = ptArr.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${ptArr[0].x},${h} ${ptArr.map(p => `L ${p.x},${p.y}`).join(" ")} L ${ptArr[ptArr.length - 1].x},${h} Z`;
  const uid = ++__advSparkSeq;
  const lineId = `advspark-line-${uid}`, areaId = `advspark-area-${uid}`;
  return /*#__PURE__*/React.createElement("svg", {
    className: "adv-kpi-spark",
    width: w,
    height: h,
    viewBox: `0 0 ${w} ${h}`,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: lineId, x1: "0", y1: "0", x2: "1", y2: "0"
  }, /*#__PURE__*/React.createElement("stop", { offset: "0%", style: { stopColor: color, stopOpacity: 0.3 } }), /*#__PURE__*/React.createElement("stop", { offset: "100%", style: { stopColor: color, stopOpacity: 1 } })), /*#__PURE__*/React.createElement("linearGradient", {
    id: areaId, x1: "0", y1: "0", x2: "0", y2: "1"
  }, /*#__PURE__*/React.createElement("stop", { offset: "0%", style: { stopColor: color, stopOpacity: 0.1 } }), /*#__PURE__*/React.createElement("stop", { offset: "100%", style: { stopColor: color, stopOpacity: 0 } }))), /*#__PURE__*/React.createElement("path", {
    d: areaPath,
    fill: `url(#${areaId})`
  }), /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: `url(#${lineId})`,
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}

/** KPI tile — the system's only blessed metric layout. Compose inside KpiStrip. */
function KpiTile({
  label,
  value,
  trend,
  sparkline,
  hintText,
  subtext,
  href,
  onClick
}) {
  const isNeutral = trend && trend.change === 0;
  const isGood = trend ? trend.lowerIsBetter ? trend.change <= 0 : trend.change >= 0 : true;
  const color = isNeutral ? "var(--ink-500)" : isGood ? "var(--success)" : "var(--danger)";
  const arrow = !trend ? "" : isNeutral ? "→" : trend.change > 0 ? "↑" : "↓";
  const mag = trend ? Math.abs(trend.change) : "";
  const body = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "adv-kpi-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-value"
  }, value), /*#__PURE__*/React.createElement(Sparkline, {
    data: sparkline,
    positive: isGood
  })), trend ? /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-trend",
    style: {
      color
    }
  }, arrow, " ", mag, /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-trend-label"
  }, trend.changeLabel)) : subtext ? /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-hint tabular"
  }, subtext) : hintText ? /*#__PURE__*/React.createElement("span", {
    className: "adv-kpi-hint"
  }, hintText) : /*#__PURE__*/React.createElement("span", {
    style: {
      height: 15
    }
  }));
  if (href || onClick) return /*#__PURE__*/React.createElement("a", {
    className: "adv-kpi adv-kpi-link",
    href: href || "#",
    onClick: onClick
  }, body);
  return /*#__PURE__*/React.createElement("div", {
    className: "adv-kpi"
  }, body);
}

/** Card container for a row of KpiTiles. */
function KpiStrip({
  children,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-kpi-strip ${className}`,
    style: style
  }, children);
}
Object.assign(__ds_scope, { KpiTile, KpiStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KpiTile.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusChip.jsx
try { (() => {
const css = `
.adv-status{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);font-size:11px;line-height:1;white-space:nowrap}
.adv-status-dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}
.adv-status-live .adv-status-dot{animation:adv-status-pulse 1.6s var(--ease-primary) infinite}
@keyframes adv-status-pulse{0%,100%{opacity:1}50%{opacity:0.35}}
.adv-status-blue{color:var(--blue)}
.adv-status-neutral{color:var(--ink-500)}
.adv-status-win{color:var(--success)}
.adv-status-loss{color:var(--danger)}
@media (prefers-reduced-motion:reduce){.adv-status-live .adv-status-dot{animation:none}}`;
if (typeof document !== "undefined" && !document.getElementById("adv-status-css")) {
  const s = document.createElement("style");
  s.id = "adv-status-css";
  s.textContent = css;
  document.head.appendChild(s);
}
const STATES = {
  uploading: {
    label: "Uploading",
    tone: "blue",
    live: true
  },
  uploaded: {
    label: "Uploaded",
    tone: "blue",
    live: false
  },
  queued: {
    label: "In line",
    tone: "neutral",
    live: false
  },
  processing: {
    label: "Processing",
    tone: "blue",
    live: true
  },
  analyzing: {
    label: "Analyzing",
    tone: "blue",
    live: true
  },
  pending: {
    label: "Analysis pending",
    tone: "neutral",
    live: false
  },
  ready: {
    label: "Ready",
    tone: "win",
    live: false
  },
  failed: {
    label: "Failed",
    tone: "loss",
    live: false
  }
};

/** Advantage Intelligence lifecycle — quiet inline dot + sentence-case text, no container. */
function StatusChip({
  status = "queued",
  label,
  className = "",
  style
}) {
  const s = STATES[status] || STATES.queued;
  return /*#__PURE__*/React.createElement("span", {
    className: `adv-status adv-status-${s.tone} ${s.live ? "adv-status-live" : ""} ${className}`,
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-status-dot"
  }), label || s.label);
}
Object.assign(__ds_scope, { StatusChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusChip.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
const css = `
.adv-badge{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-sans);font-size:10px;font-weight:500;line-height:1;text-transform:uppercase;letter-spacing:2.5px;white-space:nowrap}
.adv-badge-win{color:var(--success)}
.adv-badge-loss{color:var(--danger)}
.adv-badge-blue{color:var(--blue)}
.adv-badge-neutral{color:var(--ink-500)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-badge-css")) {
  const s = document.createElement("style");
  s.id = "adv-badge-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Outcome label — bare tracked uppercase text, no container. Green = winning, red = losing. */
function Badge({
  variant = "neutral",
  children,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `adv-badge adv-badge-${variant} ${className}`,
    style: style
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
const css = `
.adv-card{background:var(--surface-card);border:1px solid var(--border-card);border-radius:var(--radius-card);box-shadow:var(--shadow-card);font-family:var(--font-sans)}
.adv-card-elevated{box-shadow:var(--shadow-card-emphasis)}
.adv-card-ghost{background:var(--surface-muted);box-shadow:none}
.adv-card-header{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 20px}
.adv-card-header-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400)}
.adv-card-link{font-size:11px;font-weight:500;color:var(--blue);cursor:pointer;background:none;border:0;padding:0;font-family:var(--font-sans);transition:color var(--duration-hover)}
.adv-card-link:hover{color:var(--blue-hover)}
.adv-card-body{padding:2px 20px 20px}`;
if (typeof document !== "undefined" && !document.getElementById("adv-card-css")) {
  const s = document.createElement("style");
  s.id = "adv-card-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Surface card — 14px radius, hairline border. Header is quiet (H3): no rule; whitespace separates. */
function Card({
  variant = "default",
  header,
  headerAction,
  padded = true,
  children,
  className = "",
  style
}) {
  const v = variant === "elevated" ? "adv-card-elevated" : variant === "ghost" ? "adv-card-ghost" : "";
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-card ${v} ${className}`,
    style: style
  }, header && /*#__PURE__*/React.createElement("div", {
    className: "adv-card-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-card-header-label"
  }, header), typeof headerAction === "string" ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "adv-card-link"
  }, headerAction) : headerAction), padded ? /*#__PURE__*/React.createElement("div", {
    className: "adv-card-body",
    style: header ? undefined : {
      paddingTop: 20
    }
  }, children) : children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Eyebrow.jsx
try { (() => {
const css = `
.adv-eyebrow{display:flex;align-items:center;gap:12px;font-family:var(--font-sans)}
.adv-eyebrow-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400);white-space:nowrap}
.adv-eyebrow-rule{flex:1;height:1px;background:var(--border-hairline)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-eyebrow-css")) {
  const s = document.createElement("style");
  s.id = "adv-eyebrow-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** The signature section opener: 10px uppercase eyebrow, optionally with a right-aligned action. Rule is retired — opt-in only. */
function Eyebrow({
  children,
  action,
  rule = false,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-eyebrow ${className}`,
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-eyebrow-label"
  }, children), rule ? /*#__PURE__*/React.createElement("span", {
    className: "adv-eyebrow-rule"
  }) : action ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }) : null, action);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/display/Kbd.jsx
try { (() => {
const css = `
.adv-kbd{display:inline-flex;align-items:center;justify-content:center;background:var(--surface-raised);border:1px solid var(--ink-200);font-family:var(--font-sans);font-weight:500;line-height:1;color:var(--ink-700);box-shadow:var(--shadow-keycap)}
.adv-kbd-sm{min-width:16px;height:16px;padding:0 4px;font-size:10px;border-radius:3px}
.adv-kbd-md{min-width:24px;height:24px;padding:0 6px;font-size:11px;border-radius:5px}
.adv-kbd-caps{font-variant-caps:small-caps}`;
if (typeof document !== "undefined" && !document.getElementById("adv-kbd-css")) {
  const s = document.createElement("style");
  s.id = "adv-kbd-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Keycap chip. ⌘K concatenated; word keys (esc) lowercase + small-caps. */
function Kbd({
  size = "md",
  smallCaps = false,
  children,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("kbd", {
    className: `adv-kbd adv-kbd-${size} ${smallCaps ? "adv-kbd-caps" : ""} ${className}`,
    style: style
  }, children);
}
Object.assign(__ds_scope, { Kbd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Kbd.jsx", error: String((e && e.message) || e) }); }

// components/display/Skeleton.jsx
try { (() => {
/** Shimmer loading bar. Stagger a form with increasing delay for a scan-down wave. */
function Skeleton({
  width = "100%",
  height = 12,
  radius = 4,
  delay = 0,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    className: `skeleton-bar ${className}`,
    style: {
      width,
      height,
      borderRadius: radius,
      "--shimmer-delay": `${delay}ms`,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/display/Tooltip.jsx
try { (() => {
const css = `
.adv-tip-wrap{position:relative;display:inline-flex}
.adv-tip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) translateY(2px);background:var(--surface-card);border:1px solid var(--border-hairline);border-radius:var(--radius-dropdown);box-shadow:var(--shadow-dropdown);padding:10px 12px;font-family:var(--font-sans);font-size:12px;line-height:1.5;color:var(--ink-700);white-space:nowrap;opacity:0;pointer-events:none;transition:opacity var(--duration-hover) var(--ease-primary),transform var(--duration-hover) var(--ease-primary);z-index:50}
.adv-tip-wrap:hover .adv-tip,.adv-tip-wrap:focus-within .adv-tip{opacity:1;transform:translateX(-50%) translateY(0)}
.adv-tip-label{display:block;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400);margin-bottom:2px}`;
if (typeof document !== "undefined" && !document.getElementById("adv-tip-css")) {
  const s = document.createElement("style");
  s.id = "adv-tip-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Floating box tooltip — no caret; the trigger's hover state anchors it. */
function Tooltip({
  content,
  label,
  children,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `adv-tip-wrap ${className}`,
    style: style,
    tabIndex: 0
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    className: "adv-tip"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "adv-tip-label"
  }, label), content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const {
  useState
} = React;
const css = `
.adv-check{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-family:var(--font-sans);font-size:13px;color:var(--ink-700);user-select:none}
.adv-check input{position:absolute;opacity:0;width:0;height:0}
.adv-check-box{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:var(--radius-cell);border:1px solid var(--border-field);background:var(--surface-card);transition:background-color var(--duration-fast),border-color var(--duration-fast);flex-shrink:0}
.adv-check-box svg{opacity:0;transition:opacity var(--duration-fast)}
.adv-check input:checked+.adv-check-box{background:var(--blue);border-color:var(--blue)}
.adv-check input:checked+.adv-check-box svg{opacity:1}
.adv-check input:focus-visible+.adv-check-box{box-shadow:var(--focus-ring)}
.adv-check-disabled{opacity:0.5;pointer-events:none}`;
if (typeof document !== "undefined" && !document.getElementById("adv-check-css")) {
  const s = document.createElement("style");
  s.id = "adv-check-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** 16px checkbox — checked state fills Signal Blue with a white Lucide check. */
function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  className = "",
  style
}) {
  const [internal, setInternal] = useState(!!defaultChecked);
  const isChecked = checked !== undefined ? checked : internal;
  const handle = e => {
    if (checked === undefined) setInternal(e.target.checked);
    if (onChange) onChange(e.target.checked);
  };
  return /*#__PURE__*/React.createElement("label", {
    className: `adv-check ${disabled ? "adv-check-disabled" : ""} ${className}`,
    style: style
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: isChecked,
    onChange: handle,
    disabled: disabled
  }), /*#__PURE__*/React.createElement("span", {
    className: "adv-check-box"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
const css = `
.adv-field{display:flex;flex-direction:column;gap:8px;font-family:var(--font-sans)}
.adv-field-head{display:flex;align-items:center;justify-content:space-between}
.adv-field-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-500)}
.adv-field-right{font-size:11px;color:var(--blue);cursor:pointer;text-decoration:none}
.adv-field-right:hover{color:var(--blue-hover)}
.adv-input{width:100%;background:transparent;border:0;outline:none;padding:0 0 10px;font-family:var(--font-sans);font-size:14px;color:var(--ink-900)}
.adv-input::placeholder{color:var(--ink-400)}
.adv-field-rule{height:1px;width:100%;background:var(--border-hairline);transition:height 300ms var(--ease-primary),background-color 300ms var(--ease-primary)}
.adv-field:hover .adv-field-rule{background:var(--border-medium)}
.adv-field:focus-within .adv-field-rule{height:2px;background:var(--blue)}
.adv-field-error .adv-field-rule,.adv-field-error:focus-within .adv-field-rule{background:var(--error);height:1px}
.adv-field-disabled .adv-field-label{color:var(--ink-300)}
.adv-field-disabled .adv-input{color:var(--ink-500)}
.adv-field-help{font-size:11px;color:var(--ink-500)}
.adv-field-errmsg{font-size:11px;color:var(--error)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-input-css")) {
  const s = document.createElement("style");
  s.id = "adv-input-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Canonical underline input — the form vocabulary across auth, upload and settings. */
function Input({
  label,
  rightLabel,
  placeholder,
  type = "text",
  value,
  defaultValue,
  onChange,
  error,
  helper,
  disabled = false,
  id,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-field ${error ? "adv-field-error" : ""} ${disabled ? "adv-field-disabled" : ""} ${className}`,
    style: style
  }, (label || rightLabel) && /*#__PURE__*/React.createElement("div", {
    className: "adv-field-head"
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "adv-field-label"
  }, label), rightLabel && /*#__PURE__*/React.createElement("a", {
    className: "adv-field-right",
    href: rightLabel.href || "#"
  }, rightLabel.text)), /*#__PURE__*/React.createElement("input", {
    id: id,
    className: "adv-input",
    type: type,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    disabled: disabled
  }), /*#__PURE__*/React.createElement("div", {
    className: "adv-field-rule"
  }), typeof error === "string" && error ? /*#__PURE__*/React.createElement("span", {
    className: "adv-field-errmsg"
  }, error) : helper ? /*#__PURE__*/React.createElement("span", {
    className: "adv-field-help"
  }, helper) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const css = `
.adv-select-wrap{position:relative;display:flex;align-items:center}
.adv-select{appearance:none;width:100%;background:transparent;border:0;outline:none;padding:0 20px 10px 0;font-family:var(--font-sans);font-size:14px;color:var(--ink-900);cursor:pointer}
.adv-select-chev{position:absolute;right:2px;top:2px;pointer-events:none;color:var(--ink-400)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-select-css")) {
  const s = document.createElement("style");
  s.id = "adv-select-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Underline select — same field vocabulary as Input, with a Lucide chevron. */
function Select({
  label,
  options = [],
  value,
  defaultValue,
  onChange,
  disabled = false,
  id,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-field ${disabled ? "adv-field-disabled" : ""} ${className}`,
    style: style
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "adv-field-head"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "adv-field-label"
  }, label)), /*#__PURE__*/React.createElement("div", {
    className: "adv-select-wrap"
  }, /*#__PURE__*/React.createElement("select", {
    id: id,
    className: "adv-select",
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    disabled: disabled
  }, options.map(o => {
    const opt = typeof o === "string" ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value
    }, opt.label);
  })), /*#__PURE__*/React.createElement("svg", {
    className: "adv-select-chev",
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "adv-field-rule"
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
const {
  useState
} = React;
const css = `
.adv-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-family:var(--font-sans);font-size:13px;color:var(--ink-700);user-select:none}
.adv-switch input{position:absolute;opacity:0;width:0;height:0}
.adv-switch-track{width:36px;height:20px;border-radius:var(--radius-pill);background:var(--ink-200);position:relative;transition:background-color var(--duration-hover);flex-shrink:0}
.adv-switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.15);transition:transform var(--duration-hover) var(--ease-primary)}
.adv-switch input:checked+.adv-switch-track{background:var(--blue)}
.adv-switch input:checked+.adv-switch-track .adv-switch-thumb{transform:translateX(16px)}
.adv-switch input:focus-visible+.adv-switch-track{box-shadow:var(--focus-ring)}
.adv-switch-disabled{opacity:0.5;pointer-events:none}`;
if (typeof document !== "undefined" && !document.getElementById("adv-switch-css")) {
  const s = document.createElement("style");
  s.id = "adv-switch-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** 36×20 toggle — on = Signal Blue track. */
function Switch({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  className = "",
  style
}) {
  const [internal, setInternal] = useState(!!defaultChecked);
  const isChecked = checked !== undefined ? checked : internal;
  const handle = e => {
    if (checked === undefined) setInternal(e.target.checked);
    if (onChange) onChange(e.target.checked);
  };
  return /*#__PURE__*/React.createElement("label", {
    className: `adv-switch ${disabled ? "adv-switch-disabled" : ""} ${className}`,
    style: style
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    role: "switch",
    checked: isChecked,
    onChange: handle,
    disabled: disabled
  }), /*#__PURE__*/React.createElement("span", {
    className: "adv-switch-track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "adv-switch-thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
const css = `
.adv-textarea{width:100%;box-sizing:border-box;background:var(--surface-card);border:1px solid var(--border-field);border-radius:var(--radius-button);outline:none;padding:10px 12px;font-family:var(--font-sans);font-size:14px;line-height:1.5;color:var(--ink-900);resize:vertical;min-height:88px;transition:border-color var(--duration-hover),box-shadow var(--duration-hover)}
.adv-textarea::placeholder{color:var(--ink-400)}
.adv-textarea:focus{border-color:var(--blue);box-shadow:var(--focus-ring)}
.adv-textarea:disabled{background:var(--surface-field);color:var(--ink-500)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-textarea-css")) {
  const s = document.createElement("style");
  s.id = "adv-textarea-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Multi-line field — the one boxed input (multi-line needs bounds). */
function Textarea({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  rows = 4,
  disabled = false,
  id,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `adv-field ${disabled ? "adv-field-disabled" : ""} ${className}`,
    style: style
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "adv-field-head"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "adv-field-label"
  }, label)), /*#__PURE__*/React.createElement("textarea", {
    id: id,
    className: "adv-textarea",
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    rows: rows,
    disabled: disabled
  }));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
const css = `
.adv-crumbs{display:flex;align-items:center;gap:6px;font-family:var(--font-sans);font-size:11px}
.adv-crumb{color:var(--ink-500);text-decoration:none;transition:color var(--duration-hover)}
a.adv-crumb:hover{color:var(--ink-700)}
.adv-crumb-active{color:var(--ink-900)}
.adv-crumb-sep{color:var(--ink-300);display:inline-flex}`;
if (typeof document !== "undefined" && !document.getElementById("adv-crumbs-css")) {
  const s = document.createElement("style");
  s.id = "adv-crumbs-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** 11px breadcrumb trail with Lucide chevron separators. */
function Breadcrumb({
  items = [],
  className = "",
  style
}) {
  const chev = /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m9 18 6-6-6-6"
  }));
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    className: `adv-crumbs ${className}`,
    style: style
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, last ? /*#__PURE__*/React.createElement("span", {
      className: "adv-crumb adv-crumb-active",
      "aria-current": "page"
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      className: "adv-crumb",
      href: it.href || "#"
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      className: "adv-crumb-sep"
    }, chev));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNav.jsx
try { (() => {
const css = `
.adv-nav{display:flex;flex-direction:column;gap:2px;font-family:var(--font-sans)}
.adv-nav-section{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:var(--ink-400);line-height:16px;padding-left:13px;margin:0 0 12px}
.adv-nav-item{display:flex;align-items:center;gap:12px;height:36px;padding:0 14px 0 13px;border-radius:var(--radius-element);font-size:13px;color:var(--nav-fg);text-decoration:none;cursor:pointer;white-space:nowrap;transition:color var(--duration-hover),background-color var(--duration-hover);outline:none}
.adv-nav-item:hover{background:var(--surface-subtle);color:var(--nav-fg-hover)}
.adv-nav-item:focus-visible{box-shadow:var(--focus-ring)}
.adv-nav-item svg{width:14px;height:14px;flex-shrink:0}
.adv-nav-item-active,.adv-nav-item-active:hover{background:var(--blue-soft);color:var(--blue)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-nav-css")) {
  const s = document.createElement("style");
  s.id = "adv-nav-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Sidebar nav list. Active item = blue-soft wash + Signal Blue label. */
function SidebarNav({
  section,
  items = [],
  activeId,
  onSelect,
  className = "",
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: `adv-nav ${className}`,
    style: style
  }, section && /*#__PURE__*/React.createElement("p", {
    className: "adv-nav-section"
  }, section), items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.id,
    href: it.href || "#",
    "aria-current": it.id === activeId ? "page" : undefined,
    onClick: e => {
      if (onSelect) {
        e.preventDefault();
        onSelect(it.id);
      }
    },
    className: `adv-nav-item ${it.id === activeId ? "adv-nav-item-active" : ""}`
  }, it.icon, /*#__PURE__*/React.createElement("span", null, it.label))));
}
Object.assign(__ds_scope, { SidebarNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
const {
  useState
} = React;
const css = `
.adv-tabs{display:inline-flex;align-items:center;gap:20px;border-bottom:1px solid var(--border-hairline);font-family:var(--font-sans)}
.adv-tab{border:0;background:transparent;cursor:pointer;padding:6px 2px 8px;font-family:var(--font-sans);font-size:11px;font-weight:500;color:var(--ink-500);white-space:nowrap;transition:color var(--duration-hover),box-shadow var(--duration-hover);outline:none}
.adv-tab:hover{color:var(--ink-700)}
.adv-tab:focus-visible{box-shadow:var(--focus-ring)}
.adv-tab-active,.adv-tab-active:hover{color:var(--ink-900);box-shadow:inset 0 -2px 0 var(--blue)}`;
if (typeof document !== "undefined" && !document.getElementById("adv-tabs-css")) {
  const s = document.createElement("style");
  s.id = "adv-tabs-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Underline tabs (period toggles, view switches) — 2px blue rule echoes the Input focus vocabulary. */
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  className = "",
  style
}) {
  const [internal, setInternal] = useState(defaultValue ?? (items[0] && (typeof items[0] === "string" ? items[0] : items[0].id)));
  const active = value !== undefined ? value : internal;
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    className: `adv-tabs ${className}`,
    style: style
  }, items.map(t => {
    const it = typeof t === "string" ? {
      id: t,
      label: t
    } : t;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      role: "tab",
      "aria-selected": it.id === active,
      className: `adv-tab ${it.id === active ? "adv-tab-active" : ""}`,
      onClick: () => {
        if (value === undefined) setInternal(it.id);
        if (onChange) onChange(it.id);
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Dialog.jsx
try { (() => {
const css = `
.adv-dialog-overlay{position:fixed;inset:0;background:rgba(13,13,13,0.4);display:flex;align-items:center;justify-content:center;padding:24px;z-index:100;animation:fadeIn 300ms ease-out}
.adv-dialog{background:var(--surface-card);border:1px solid var(--border-medium);border-radius:var(--radius-modal);box-shadow:var(--shadow-dropdown);width:100%;max-width:440px;font-family:var(--font-sans);animation:slideDown 300ms ease-out}
.adv-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 0}
.adv-dialog-title{font-size:16px;font-weight:400;letter-spacing:-0.4px;color:var(--ink-dialog);margin:0}
.adv-dialog-desc{font-size:12px;line-height:1.5;color:var(--ink-500);margin:6px 0 0}
.adv-dialog-body{padding:16px 20px 20px}
.adv-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:0 20px 20px}`;
if (typeof document !== "undefined" && !document.getElementById("adv-dialog-css")) {
  const s = document.createElement("style");
  s.id = "adv-dialog-css";
  s.textContent = css;
  document.head.appendChild(s);
}

/** Modal dialog — surface radius (14px, shared with cards), medium border, dropdown shadow. */
function Dialog({
  open = true,
  title,
  description,
  onClose,
  footer,
  children,
  width = 440,
  className = "",
  style
}) {
  if (!open) return null;
  const closeIcon = /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "adv-dialog-overlay",
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    className: `adv-dialog ${className}`,
    style: {
      maxWidth: width,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "adv-dialog-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "adv-dialog-title"
  }, title), description && /*#__PURE__*/React.createElement("p", {
    className: "adv-dialog-desc"
  }, description)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Close",
    onClick: onClose,
    className: "adv-iconbtn adv-iconbtn-sm",
    style: {
      margin: "-4px -6px 0 0"
    }
  }, closeIcon)), /*#__PURE__*/React.createElement("div", {
    className: "adv-dialog-body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "adv-dialog-foot"
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Dialog.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/HomeScreen.jsx
try { (() => {
/* Home — welcome heading, KPI strip, recent matches by event, AI insight +
   serve placement rail. Recreated from home/ components. */
if (typeof document !== "undefined" && !document.getElementById("adv-home-css")) {
  const st = document.createElement("style");
  st.id = "adv-home-css";
  st.textContent = ".adv-home-statcols{display:flex;gap:20px;flex-shrink:0}@media(max-width:1100px){.adv-home-statcols{display:none}}";
  document.head.appendChild(st);
}
function HomeScreen({
  onOpenMatch
}) {
  const {
    KpiStrip,
    KpiTile,
    Card,
    Badge,
    Button,
    InsightStatChip
  } = window.AdvantageDesignSystemV2_932d14;
  const s = {
    top: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 32
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "5fr 2fr",
      gap: 32,
      alignItems: "start",
      marginTop: 24
    },
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 8px",
      margin: "0 -8px",
      borderRadius: 8,
      cursor: "pointer",
      transition: "background-color 200ms"
    },
    line: won => ({
      width: 1,
      height: 40,
      borderRadius: 9999,
      flexShrink: 0,
      background: won ? "var(--success)" : "var(--danger)"
    }),
    opp: {
      fontSize: 14,
      color: "var(--ink-900)",
      whiteSpace: "nowrap"
    },
    score: {
      fontSize: 12,
      color: "var(--ink-500)",
      letterSpacing: "0.3px",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    },
    wl: won => ({
      fontSize: 10,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "2.5px",
      whiteSpace: "nowrap",
      color: won ? "var(--success)" : "var(--danger)"
    }),
    statCol: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      alignItems: "flex-end"
    },
    statLbl: {
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: "2.5px",
      color: "var(--ink-400)"
    },
    statVal: {
      fontSize: 13,
      fontWeight: 400,
      color: "var(--ink-900)",
      fontVariantNumeric: "tabular-nums"
    }
  };
  const matches = [{
    opp: "Marcus Chen",
    meta: "Stanford · UTR 12.4",
    score: "6-4, 3-6, 7-5",
    won: true,
    fs: "61%",
    we: "24/19",
    bp: "4/6"
  }, {
    opp: "Alex Petrov",
    meta: "Cal · UTR 12.9",
    score: "4-6, 5-7",
    won: false,
    fs: "54%",
    we: "18/26",
    bp: "1/5"
  }, {
    opp: "Jamie Ortiz",
    meta: "UCLA · UTR 11.8",
    score: "6-3, 6-4",
    won: true,
    fs: "67%",
    we: "27/14",
    bp: "5/7"
  }];
  const Row = ({
    m
  }) => /*#__PURE__*/React.createElement("div", {
    style: s.row,
    onClick: onOpenMatch,
    onMouseEnter: e => e.currentTarget.style.backgroundColor = "var(--surface-muted)",
    onMouseLeave: e => e.currentTarget.style.backgroundColor = "transparent"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      minWidth: 0,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: s.line(m.won)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      whiteSpace: "nowrap",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: s.opp
  }, m.opp), /*#__PURE__*/React.createElement("span", {
    style: s.score
  }, m.score), /*#__PURE__*/React.createElement("span", {
    style: s.wl(m.won)
  }, m.won ? "Won" : "Lost")), /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.statLbl,
      letterSpacing: "2.5px",
      whiteSpace: "nowrap"
    }
  }, m.meta))), /*#__PURE__*/React.createElement("div", {
    className: "adv-home-statcols"
  }, /*#__PURE__*/React.createElement("div", {
    style: s.statCol
  }, /*#__PURE__*/React.createElement("span", {
    style: s.statLbl
  }, "First Serve"), /*#__PURE__*/React.createElement("span", {
    style: s.statVal
  }, m.fs)), /*#__PURE__*/React.createElement("div", {
    style: s.statCol
  }, /*#__PURE__*/React.createElement("span", {
    style: s.statLbl
  }, "Winners / Errors"), /*#__PURE__*/React.createElement("span", {
    style: s.statVal
  }, m.we)), /*#__PURE__*/React.createElement("div", {
    style: s.statCol
  }, /*#__PURE__*/React.createElement("span", {
    style: s.statLbl
  }, "Breakpoints"), /*#__PURE__*/React.createElement("span", {
    style: s.statVal
  }, m.bp))));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1120,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: s.top
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Wednesday, August 6"), /*#__PURE__*/React.createElement("h1", {
    className: "text-display",
    style: {
      margin: 0
    }
  }, "Good afternoon, Sam")), /*#__PURE__*/React.createElement(Button, null, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.plus
  }), " New match")), /*#__PURE__*/React.createElement(KpiStrip, null, /*#__PURE__*/React.createElement(KpiTile, {
    label: "Win Rate",
    value: "68%",
    trend: {
      change: 4.2,
      changeLabel: "vs last 5"
    },
    sparkline: [54, 58, 62, 60, 68]
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "1st Serve %",
    value: "61%",
    trend: {
      change: -2.1,
      changeLabel: "vs last 5"
    },
    sparkline: [66, 64, 63, 65, 61]
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "Double Faults",
    value: "3.1",
    trend: {
      change: -0.8,
      changeLabel: "per match",
      lowerIsBetter: true
    },
    sparkline: [4.8, 4.1, 3.9, 3.4, 3.1]
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "Last Match",
    value: "W 6-4, 7-5",
    subtext: "vs. J. Ortiz \xB7 Hard"
  })), /*#__PURE__*/React.createElement("div", {
    style: s.grid
  }, /*#__PURE__*/React.createElement(Card, {
    header: "ITA Regional Championships",
    headerAction: /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "adv-card-link",
      onClick: onOpenMatch
    }, "View all")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, matches.map(m => /*#__PURE__*/React.createElement(Row, {
    key: m.opp,
    m: m
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Card, {
    header: "AI Match Insight"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.65,
      color: "var(--ink-700)"
    }
  }, "You won 78% of first-serve points against Chen but landed only 54% of first serves \u2014 the serve, not the rally, decided the second set."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 18,
      flexWrap: "wrap",
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(InsightStatChip, {
    label: "1st Serve Pts Won",
    value: "78%",
    change: 6
  }), /*#__PURE__*/React.createElement(InsightStatChip, {
    label: "1st Serve %",
    value: "54%",
    change: -7
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "12px 0 0",
      fontSize: 10,
      color: "var(--ink-400)"
    }
  }, "Generated from your last 3 matches")), /*#__PURE__*/React.createElement(Card, {
    header: "Serve Placement"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 220 130",
    style: {
      width: "100%",
      display: "block"
    },
    "aria-label": "Serve placement on deuce court"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "8",
    width: "200",
    height: "114",
    rx: "3",
    fill: "var(--viz-court-fill)"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "8",
    width: "200",
    height: "114",
    rx: "3",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "110",
    y1: "8",
    x2: "110",
    y2: "122",
    stroke: "#fff",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "60",
    y1: "8",
    x2: "60",
    y2: "122",
    stroke: "#fff",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "160",
    y1: "8",
    x2: "160",
    y2: "122",
    stroke: "#fff",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "60",
    y1: "65",
    x2: "160",
    y2: "65",
    stroke: "#fff",
    strokeWidth: "1.5"
  }), [[128, 30], [143, 44], [150, 28], [131, 52], [148, 92], [135, 102], [152, 78], [126, 88], [155, 50], [140, 68]].map(([x, y], i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: x,
    cy: y,
    r: "4",
    fill: i % 3 === 2 ? "rgba(100,116,139,0.55)" : "rgba(59,130,246,0.55)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginTop: 10,
      fontSize: 10,
      color: "var(--ink-500)"
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 2,
      height: 12,
      borderRadius: 1,
      background: "var(--player-1)",
      marginRight: 6,
      verticalAlign: "-2px"
    }
  }), "First serve"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 2,
      height: 12,
      borderRadius: 1,
      background: "var(--viz-opp)",
      marginRight: 6,
      verticalAlign: "-2px"
    }
  }), "Second serve"))))));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/LoginScreen.jsx
try { (() => {
/* Auth split screen — brand mesh panel + underline-input form.
   Recreated from (auth)/layout.tsx, brand-panel.tsx, login-form.tsx. */
function LoginScreen({
  onSignIn
}) {
  const {
    Input,
    Button
  } = window.AdvantageDesignSystemV2_932d14;
  const s = {
    frame: {
      display: "flex",
      height: "100%",
      fontFamily: "var(--font-sans)"
    },
    brand: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "27px 64px 64px",
      boxSizing: "border-box"
    },
    hero: {
      fontSize: 56,
      fontWeight: 300,
      lineHeight: 1.02,
      letterSpacing: "-1.5px",
      color: "#fff",
      margin: 0
    },
    sub: {
      fontSize: 18,
      fontWeight: 300,
      lineHeight: 1.55,
      letterSpacing: "-0.1px",
      color: "rgba(255,255,255,0.86)",
      maxWidth: 420,
      margin: "32px 0 0"
    },
    foot: {
      fontSize: 13,
      lineHeight: 1.7,
      letterSpacing: "0.5px",
      color: "rgba(255,255,255,0.6)"
    },
    panel: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--surface-card)",
      overflowY: "auto",
      padding: "40px 64px"
    },
    form: {
      width: "100%",
      maxWidth: 360,
      display: "flex",
      flexDirection: "column",
      gap: 24
    },
    google: {
      display: "flex",
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderRadius: 6,
      border: 0,
      background: "#f2f2f2",
      color: "#3c4043",
      fontFamily: "var(--font-sans)",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer"
    },
    divider: {
      display: "flex",
      alignItems: "center",
      gap: 16
    },
    divRule: {
      height: 1,
      flex: 1,
      background: "var(--border-faint)"
    },
    divTxt: {
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: 3,
      color: "var(--ink-faint)"
    },
    links: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      color: "var(--ink-500)"
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: s.frame
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-mesh-gradient",
    style: s.brand
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.svg",
    alt: "Advantage",
    style: {
      height: 24,
      alignSelf: "flex-start",
      filter: "brightness(0) invert(1)"
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: s.hero
  }, "Performance", /*#__PURE__*/React.createElement("br", null), "Intelligence", /*#__PURE__*/React.createElement("br", null), "for Competitive", /*#__PURE__*/React.createElement("br", null), "Tennis."), /*#__PURE__*/React.createElement("p", {
    style: s.sub
  }, "AI-powered match analysis and performance tracking to elevate your game and outsmart opponents."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      width: 48,
      background: "rgba(255,255,255,0.6)",
      marginTop: 32
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: s.foot
  }, "Built by former collegiate players.", /*#__PURE__*/React.createElement("br", null), "Designed for competitive advantage.")), /*#__PURE__*/React.createElement("div", {
    style: s.panel
  }, /*#__PURE__*/React.createElement("form", {
    style: s.form,
    className: "animate-fade-up",
    onSubmit: e => {
      e.preventDefault();
      onSignIn();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Welcome back."), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1.6,
      color: "var(--ink-700)"
    }
  }, "Enter your credentials to access your athlete dashboard and performance insights."), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-400)"
    }
  }, "Match analytics for collegiate programs and competitive players.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Email",
    type: "email",
    placeholder: "name@university.edu",
    defaultValue: "s.whitmore@stanford.edu"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Password",
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    defaultValue: "password",
    rightLabel: {
      text: "Forgot Password?"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    size: "lg"
  }, "Sign In"), /*#__PURE__*/React.createElement("div", {
    style: s.divider
  }, /*#__PURE__*/React.createElement("span", {
    style: s.divRule
  }), /*#__PURE__*/React.createElement("span", {
    style: s.divTxt
  }, "OR"), /*#__PURE__*/React.createElement("span", {
    style: s.divRule
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: s.google,
    onClick: onSignIn
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    fillRule: "evenodd"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z",
    fill: "#4285F4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z",
    fill: "#34A853"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z",
    fill: "#FBBC05"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z",
    fill: "#EA4335"
  }))), "Sign in with Google"), /*#__PURE__*/React.createElement("div", {
    style: s.links
  }, /*#__PURE__*/React.createElement("span", null, "Don't have an account? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Sign up")), /*#__PURE__*/React.createElement("span", null, "Bringing a team? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Request access.")))))));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/MatchReportScreen.jsx
try { (() => {
/* Match report — hero + scoreboard + KPI row + two-column body (statistics
   with player-attributed bars | AI insight + film). Recreated from the
   consolidated match detail page; includes the v2 confidence line. */
function MatchReportScreen({
  onBack
}) {
  const {
    KpiStrip,
    KpiTile,
    Card,
    Badge,
    Eyebrow,
    InsightStatChip,
    StatusChip,
    Button
  } = window.AdvantageDesignSystemV2_932d14;
  const s = {
    hero: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 24
    },
    sets: {
      display: "flex",
      gap: 18,
      alignItems: "baseline",
      flexShrink: 0,
      whiteSpace: "nowrap"
    },
    setCol: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      alignItems: "center"
    },
    setNum: win => ({
      fontSize: 18,
      fontWeight: 400,
      letterSpacing: "-0.3px",
      fontVariantNumeric: "tabular-nums",
      color: win ? "var(--ink-900)" : "var(--ink-400)"
    }),
    grid: {
      display: "grid",
      gridTemplateColumns: "5fr 2fr",
      gap: 32,
      alignItems: "start",
      marginTop: 24
    },
    statRow: {
      display: "grid",
      gridTemplateColumns: "44px 1fr 150px 1fr 44px",
      gap: 10,
      alignItems: "center",
      padding: "9px 0",
      borderBottom: "1px solid var(--border-hairline)"
    },
    barTrack: {
      height: 4,
      borderRadius: 2,
      background: "var(--ink-100)",
      overflow: "hidden"
    },
    lbl: {
      fontSize: 11,
      color: "var(--ink-500)",
      textAlign: "center"
    },
    num: lead => ({
      fontSize: 13,
      fontWeight: 400,
      color: lead ? "var(--ink-900)" : "var(--ink-500)",
      fontVariantNumeric: "tabular-nums"
    })
  };
  const stats = [{
    label: "First serve in",
    p1: 61,
    p2: 68,
    f1: "61%",
    f2: "68%"
  }, {
    label: "1st serve points won",
    p1: 78,
    p2: 64,
    f1: "78%",
    f2: "64%"
  }, {
    label: "Break points saved",
    p1: 67,
    p2: 50,
    f1: "4/6",
    f2: "3/6"
  }, {
    label: "Winners",
    p1: 60,
    p2: 48,
    f1: "24",
    f2: "19"
  }, {
    label: "Unforced errors",
    p1: 44,
    p2: 58,
    f1: "19",
    f2: "25"
  }];
  const StatRow = ({
    r,
    last
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      ...s.statRow,
      borderBottom: last ? 0 : s.statRow.borderBottom
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: s.num(r.p1 >= r.p2)
  }, r.f1), /*#__PURE__*/React.createElement("div", {
    style: s.barTrack
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${r.p1}%`,
      background: r.p1 >= r.p2 ? "var(--player-1)" : "var(--player-1-bar-tint)",
      borderRadius: 2,
      marginLeft: `${100 - r.p1}%`
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: s.lbl
  }, r.label), /*#__PURE__*/React.createElement("div", {
    style: s.barTrack
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${r.p2}%`,
      background: r.p2 > r.p1 ? "var(--player-2)" : "var(--player-2-bar-tint)",
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.num(r.p2 > r.p1),
      textAlign: "right"
    }
  }, r.f2));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1120,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: s.hero
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "ITA Regional Championships \xB7 Aug 3, 2026 \xB7 Hard"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "text-display",
    style: {
      margin: 0
    }
  }, "vs. Marcus Chen"), /*#__PURE__*/React.createElement(Badge, {
    variant: "win",
    style: {
      position: "relative",
      top: -4
    }
  }, "Won"))), /*#__PURE__*/React.createElement("div", {
    style: s.sets
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-score",
    style: {
      whiteSpace: "nowrap",
      flexShrink: 0
    }
  }, "6-4"), /*#__PURE__*/React.createElement("span", {
    className: "text-score",
    style: {
      whiteSpace: "nowrap",
      flexShrink: 0,
      color: "var(--ink-300)"
    }
  }, "3-6"), /*#__PURE__*/React.createElement("span", {
    className: "text-score",
    style: {
      whiteSpace: "nowrap",
      flexShrink: 0
    }
  }, "7-5"))), /*#__PURE__*/React.createElement(KpiStrip, null, /*#__PURE__*/React.createElement(KpiTile, {
    label: "1st Serve %",
    value: "61%",
    trend: {
      change: -2.1,
      changeLabel: "vs your avg"
    }
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "1st Serve Pts Won",
    value: "78%",
    trend: {
      change: 6.4,
      changeLabel: "vs your avg"
    }
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "Winners / UE",
    value: "24 / 19",
    hintText: "+5 differential"
  }), /*#__PURE__*/React.createElement(KpiTile, {
    label: "Break Pts Saved",
    value: "4/6",
    trend: {
      change: 12,
      changeLabel: "vs your avg"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: s.grid
  }, /*#__PURE__*/React.createElement(Card, {
    header: "Match Statistics",
    headerAction: /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 14,
        fontSize: 10,
        color: "var(--ink-500)",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        width: 2,
        height: 12,
        borderRadius: 1,
        background: "var(--player-1)",
        marginRight: 6,
        verticalAlign: "-2px"
      }
    }), "You"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        width: 2,
        height: 12,
        borderRadius: 1,
        background: "var(--player-2)",
        marginRight: 6,
        verticalAlign: "-2px"
      }
    }), "Chen"))
  }, stats.map((r, i) => /*#__PURE__*/React.createElement(StatRow, {
    key: r.label,
    r: r,
    last: i === stats.length - 1
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "14px 0 0",
      fontSize: 11,
      color: "var(--ink-700)",
      background: "var(--surface-subtle)",
      borderRadius: 6,
      padding: "8px 10px"
    }
  }, "Derived stats reconciled with your score within one game.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Card, {
    header: "Film",
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "16/9",
      background: "var(--surface-dark)",
      borderRadius: "0 0 13px 13px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.14)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff"
    }
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.play,
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 12,
      bottom: 10,
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "rgba(255,255,255,0.7)"
    }
  }, "00:41:18"), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 12,
      top: 10,
      background: "rgba(13,13,13,0.55)",
      borderRadius: 9999,
      padding: "4px 10px"
    }
  }, /*#__PURE__*/React.createElement(StatusChip, {
    status: "pending",
    style: {
      color: "rgba(255,255,255,0.85)"
    }
  })))), /*#__PURE__*/React.createElement(Card, {
    header: "AI Match Insight"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.65,
      color: "var(--ink-700)"
    }
  }, "The serve decided the second set: first-serve percentage fell to 54% and Chen attacked the second ball early."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 18,
      flexWrap: "wrap",
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(InsightStatChip, {
    label: "Set 2 \xB7 1st Serve",
    value: "54%",
    change: -7
  }), /*#__PURE__*/React.createElement(InsightStatChip, {
    label: "2nd Serve Pts Won",
    value: "41%"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "adv-card-link",
    onClick: onBack
  }, "\u2190 Back to matches"))))));
}
window.MatchReportScreen = MatchReportScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/MatchReportScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/MatchesScreen.jsx
try { (() => {
/* Matches library — columnar list with per-row analysis lifecycle.
   Recreated from match-card-list.tsx (grid: 2fr 62px 1.05fr 1.2fr 1.9fr 84px). */
function MatchesScreen({
  onOpenMatch
}) {
  const {
    Card,
    Button
  } = window.AdvantageDesignSystemV2_932d14;
  const COLS = "2fr 62px 1.05fr 1.2fr 1.9fr 84px";
  const s = {
    top: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 24
    },
    head: {
      display: "grid",
      gridTemplateColumns: COLS,
      gap: "0 20px",
      padding: "0 36px 10px 14px",
      alignItems: "center"
    },
    hcell: {
      fontSize: 9,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "2.5px",
      color: "var(--ink-400)"
    },
    row: {
      display: "grid",
      gridTemplateColumns: COLS,
      gap: "0 20px",
      alignItems: "center",
      height: 52,
      padding: "0 36px 0 14px",
      borderBottom: "1px solid var(--border-hairline)",
      cursor: "pointer",
      transition: "background-color 200ms"
    },
    event: {
      fontSize: 12,
      color: "var(--ink-900)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    result: w => ({
      fontSize: 10,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "2px",
      color: w ? "var(--success)" : "var(--danger)"
    }),
    score: {
      fontSize: 12,
      color: "var(--ink-tertiary)",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.3px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    opp: {
      fontSize: 12,
      color: "var(--ink-900)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    astat: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      fontSize: 11
    },
    cta: {
      fontSize: 11,
      fontWeight: 500,
      color: "var(--blue)",
      textAlign: "right",
      whiteSpace: "nowrap"
    },
    barTrack: {
      height: 2,
      borderRadius: 9999,
      background: "var(--surface-skeleton)",
      overflow: "hidden"
    },
    bar: p => ({
      height: "100%",
      width: `${p}%`,
      borderRadius: 9999,
      background: "var(--blue)"
    })
  };
  const rows = [{
    event: "ITA Regional Championships",
    won: true,
    score: "6-4, 3-6, 7-5",
    opp: "Marcus Chen",
    a: {
      kind: "ready",
      label: "Analysis ready"
    },
    cta: "View report"
  }, {
    event: "Pac-12 Dual — Court 2",
    won: true,
    score: "6-2, 6-4",
    opp: "Devon Blake",
    a: {
      kind: "inflight",
      label: "Analyzing footage",
      pct: 62
    },
    cta: "Cancel"
  }, {
    event: "Saturday Challenge Ladder",
    won: false,
    score: "4-6, 5-7",
    opp: "Alex Petrov",
    a: {
      kind: "pending",
      label: "Video processed — analysis pending"
    },
    cta: "Watch film"
  }, {
    event: "NorCal Open Qualifier",
    won: false,
    score: "3-6, 4-6",
    opp: "Riko Tanaka",
    a: {
      kind: "failed",
      label: "Analysis failed"
    },
    cta: "Retry"
  }, {
    event: "Practice set vs. teammate",
    won: true,
    score: "6-3, 6-4",
    opp: "Jamie Ortiz",
    a: {
      kind: "manual",
      label: "Imported from SwingVision"
    },
    cta: "View report"
  }];
  const Analysis = ({
    a
  }) => a.kind === "inflight" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: "var(--blue)",
      whiteSpace: "nowrap"
    }
  }, a.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: "var(--blue)",
      fontVariantNumeric: "tabular-nums"
    }
  }, a.pct, "%")), /*#__PURE__*/React.createElement("div", {
    style: s.barTrack
  }, /*#__PURE__*/React.createElement("div", {
    style: s.bar(a.pct)
  }))) : a.kind === "ready" ? /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.astat,
      color: "var(--ink-700)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--success)",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.check
  })), a.label) : a.kind === "failed" ? /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.astat,
      color: "var(--danger)"
    }
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.cx
  }), a.label) : a.kind === "pending" ? /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.astat,
      color: "var(--ink-700)"
    }
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.video
  }), a.label) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-400)"
    }
  }, a.label);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1120,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: s.top
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "12 matches \xB7 8 won"), /*#__PURE__*/React.createElement("h1", {
    className: "text-display",
    style: {
      margin: 0
    }
  }, "Matches")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.filter
  }), " Filter \xB7 2"), /*#__PURE__*/React.createElement(Button, null, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.plus
  }), " New match"))), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: s.head
  }, /*#__PURE__*/React.createElement("span", {
    style: s.hcell
  }, "Event"), /*#__PURE__*/React.createElement("span", {
    style: s.hcell
  }, "Result"), /*#__PURE__*/React.createElement("span", {
    style: s.hcell
  }, "Score"), /*#__PURE__*/React.createElement("span", {
    style: s.hcell
  }, "Opponent"), /*#__PURE__*/React.createElement("span", {
    style: s.hcell
  }, "Analysis"), /*#__PURE__*/React.createElement("span", null)), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      ...s.row,
      borderBottom: i === rows.length - 1 ? "0" : s.row.borderBottom
    },
    onClick: onOpenMatch,
    onMouseEnter: e => e.currentTarget.style.backgroundColor = "var(--surface-subtle)",
    onMouseLeave: e => e.currentTarget.style.backgroundColor = "transparent"
  }, /*#__PURE__*/React.createElement("span", {
    style: s.event
  }, r.event), /*#__PURE__*/React.createElement("span", {
    style: s.result(r.won)
  }, r.won ? "Won" : "Lost"), /*#__PURE__*/React.createElement("span", {
    style: s.score
  }, r.score), /*#__PURE__*/React.createElement("span", {
    style: s.opp
  }, r.opp), /*#__PURE__*/React.createElement(Analysis, {
    a: r.a
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...s.cta,
      color: r.a.kind === "failed" ? "var(--danger)" : r.a.kind === "inflight" ? "var(--ink-500)" : "var(--blue)"
    }
  }, r.cta))))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      color: "var(--ink-400)",
      marginTop: 12
    }
  }, "Processing rows are driven by Advantage Intelligence job status \u2014 no ETA is ever promised."));
}
window.MatchesScreen = MatchesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/MatchesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/Shell.jsx
try { (() => {
/* Dashboard shell — sidebar (240px, white, hairline right border) + 44px sticky
   header. Recreated from app-sidebar.tsx + header.tsx. */
const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  cx: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  filter: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
};
function LIcon({
  d,
  size = 14,
  sw = 1.5,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    "aria-hidden": "true",
    dangerouslySetInnerHTML: {
      __html: d
    }
  });
}
function Shell({
  active,
  onNav,
  onLogout,
  crumbs,
  children
}) {
  const {
    SidebarNav,
    IconButton,
    Kbd,
    Breadcrumb
  } = window.AdvantageDesignSystemV2_932d14;
  const styles = {
    frame: {
      display: "flex",
      height: "100%",
      background: "var(--surface-page)",
      fontFamily: "var(--font-sans)"
    },
    side: {
      width: 240,
      flexShrink: 0,
      background: "var(--surface-card)",
      borderRight: "1px solid #F0F0F0",
      display: "flex",
      flexDirection: "column",
      padding: "40px 16px 20px",
      boxSizing: "border-box"
    },
    main: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    header: {
      position: "sticky",
      top: 0,
      zIndex: 30,
      height: 44,
      padding: "0 16px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-hairline)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0
    },
    content: {
      flex: 1,
      overflowY: "auto",
      padding: "40px 32px"
    },
    searchBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: 32,
      padding: "0 10px",
      borderRadius: 8,
      border: 0,
      background: "transparent",
      color: "var(--nav-fg)",
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      cursor: "pointer"
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: "var(--surface-subtle)",
      color: "var(--ink-700)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      fontWeight: 600,
      cursor: "pointer",
      border: 0
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: styles.frame
  }, /*#__PURE__*/React.createElement("aside", {
    style: styles.side
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.svg",
    alt: "Advantage",
    style: {
      width: 141,
      height: 24
    }
  })), /*#__PURE__*/React.createElement(SidebarNav, {
    section: "Main",
    activeId: active,
    onSelect: onNav,
    items: [{
      id: "home",
      label: "Home",
      icon: /*#__PURE__*/React.createElement(LIcon, {
        d: ICONS.home
      })
    }, {
      id: "matches",
      label: "Matches",
      icon: /*#__PURE__*/React.createElement(LIcon, {
        d: ICONS.calendar
      })
    }, {
      id: "statistics",
      label: "Statistics",
      icon: /*#__PURE__*/React.createElement(LIcon, {
        d: ICONS.chart
      })
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(SidebarNav, {
    activeId: active,
    onSelect: onNav,
    items: [{
      id: "settings",
      label: "Settings",
      icon: /*#__PURE__*/React.createElement(LIcon, {
        d: ICONS.settings
      })
    }, {
      id: "help",
      label: "Help Center",
      icon: /*#__PURE__*/React.createElement(LIcon, {
        d: ICONS.help
      })
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: styles.main
  }, /*#__PURE__*/React.createElement("header", {
    style: styles.header
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    size: "md",
    label: "Toggle sidebar"
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.panel,
    size: 15
  })), crumbs && /*#__PURE__*/React.createElement(Breadcrumb, {
    items: crumbs.map(c => ({
      label: c.label,
      href: c.onClick ? "#" : undefined
    }))
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: styles.searchBtn
  }, /*#__PURE__*/React.createElement(LIcon, {
    d: ICONS.search,
    size: 15
  }), "Search ", /*#__PURE__*/React.createElement(Kbd, {
    size: "sm"
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    style: styles.avatar,
    onClick: onLogout,
    title: "Sign out"
  }, "SW"))), /*#__PURE__*/React.createElement("div", {
    style: styles.content,
    className: "animate-page-enter",
    key: active
  }, children)));
}
Object.assign(window, {
  Shell,
  LIcon,
  ICONS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/Shell.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.FormPills = __ds_scope.FormPills;

__ds_ns.InsightStatChip = __ds_scope.InsightStatChip;

__ds_ns.KpiTile = __ds_scope.KpiTile;

__ds_ns.KpiStrip = __ds_scope.KpiStrip;

__ds_ns.StatusChip = __ds_scope.StatusChip;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Kbd = __ds_scope.Kbd;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.SidebarNav = __ds_scope.SidebarNav;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Dialog = __ds_scope.Dialog;

})();
