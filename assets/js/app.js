// =============================================
//  BHANDOL HARDWARE — app.js (Enhanced UX - Phase 4) - FULL STACK REFACTOR
// =============================================

// --- STATE ---
let appUsers = [];
let appProducts = [];
let appTxns = [];
let currentFilteredProducts = null;
let currentFilteredTxns = null;
// ── Backend location ─────────────────────────────────────────────
// The frontend (static site) and backend (web service) are deployed to
// separate Render URLs, so in production we must call the backend's full URL.
// 👉 After deploying the backend, paste its Render URL here (no trailing slash).
const PROD_BACKEND = "https://bhandol-backend.onrender.com";
// Where the backend runs during local development. This is a FULL URL (with the
// backend's own port) so it works even when the frontend is served separately —
// e.g. VS Code Live Server on :5500 — instead of by the backend itself.
const LOCAL_BACKEND = "http://localhost:3000";
const isLocalHost = ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:";
const API_URL = isLocalHost ? `${LOCAL_BACKEND}/api` : `${PROD_BACKEND}/api`;

// ── Branch / auth state ──────────────────────────────────────────
let appBranches = [];

function getAuthToken()   { return localStorage.getItem("authToken"); }
function getUserRole()    { return localStorage.getItem("userRole"); }
function getMyBranchId()  { return localStorage.getItem("branchId") || null; }
// The branch an admin is currently viewing: "all" | <branchId>. Staff ignore this.
function getAdminBranch() { return localStorage.getItem("adminBranch") || "all"; }
function setAdminBranch(v){ localStorage.setItem("adminBranch", v || "all"); }

function branchName(id) {
  if (!id) return "All Branches";
  const b = appBranches.find(x => x.id === id);
  return b ? b.name : id;
}

// The branch query string appended to admin GETs so the server returns the
// right slice. Staff send nothing — the server forces their branch from the token.
function branchQuery() {
  if (getUserRole() !== "admin") return "";
  const sel = getAdminBranch();
  return (!sel || sel === "all") ? "?branch=all" : `?branch=${encodeURIComponent(sel)}`;
}

// The branchId a WRITE should target. Staff: null (server forces their branch).
// Admin: whichever branch they're currently viewing (must be a real branch, not "all").
function writeBranchId() {
  if (getUserRole() !== "admin") return undefined;      // server derives from token
  const sel = getAdminBranch();
  return (!sel || sel === "all") ? undefined : sel;
}

// ── Authenticated fetch ──────────────────────────────────────────
// Wrap the global fetch so every call to our backend carries the signed token.
// This is what lets the server trust the caller's role + branch on each request.
(function () {
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    const url = (typeof input === "string") ? input : (input && input.url) || "";
    const isApi = url.startsWith(API_URL) || url.startsWith(`${PROD_BACKEND}/api`) || url.startsWith("/api");
    if (isApi) {
      const token = getAuthToken();
      if (token) {
        init = { ...init };
        init.headers = { ...(init.headers || {}), Authorization: `Bearer ${token}` };
      }
    }
    return _fetch(input, init);
  };
})();

// ===== CATEGORY COLOR SYSTEM =====
const CATEGORY_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#0ea5e9', // Sky Blue
  '#f97316', // Orange
  '#64748b', // Slate
  '#84cc16'  // Lime
];

function getCategoryColor(category) {
  let map = {};
  // Upgraded storage key to v2 to force clients to clear out the old clashing color cache
  try { map = JSON.parse(localStorage.getItem("catColorMap_v2") || "{}"); } catch (e) { map = {}; }
  if (map[category]) return map[category];
  const usedColors = Object.values(map);
  const nextColor = CATEGORY_COLORS.find(c => !usedColors.includes(c)) || CATEGORY_COLORS[Object.keys(map).length % CATEGORY_COLORS.length];
  map[category] = nextColor;
  localStorage.setItem("catColorMap_v2", JSON.stringify(map));
  return nextColor;
}

function categoryBadge(category) {
  const color = getCategoryColor(category);
  return `<span class="category-badge" style="--cat-color: ${color}">${category}</span>`;
}


// Low stock threshold — configurable, persisted in localStorage (synced from server settings)
function getLowStockThreshold() {
  const val = parseInt(localStorage.getItem("lowStockThreshold") || "8", 10);
  return isNaN(val) || val < 1 ? 8 : val;
}

// Low Stock Detection: dynamically evaluate against product's configured min_threshold, falling back to default threshold
function isProductLowStock(p) {
  if (!p) return false;
  const minVal = (p.min_threshold !== undefined && p.min_threshold !== null && p.min_threshold !== '') ? parseInt(p.min_threshold, 10)
               : (p.min_stock !== undefined && p.min_stock !== null && p.min_stock !== '') ? parseInt(p.min_stock, 10)
               : (p.minStock !== undefined && p.minStock !== null && p.minStock !== '') ? parseInt(p.minStock, 10)
               : (p.minThreshold !== undefined && p.minThreshold !== null && p.minThreshold !== '') ? parseInt(p.minThreshold, 10)
               : 0;

  if (!isNaN(minVal) && minVal > 0) {
    return p.quantity > 0 && p.quantity <= minVal;
  }
  const fallback = getLowStockThreshold();
  return p.quantity > 0 && p.quantity <= fallback;
}

// Low Stock Protection — configurable toggle, persisted in localStorage (synced from server settings)
function getLowStockProtectionEnabled() {
  return localStorage.getItem("lowStockProtectionEnabled") === "true";
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getUsers() { return appUsers; }
function getProducts() { return appProducts; }
function getTransactions() { return appTxns; }

function nextTxnId() {
  const txns = getTransactions();
  let maxNum = 0;
  txns.forEach(t => {
    const num = parseInt(t.id.replace("TXN", ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return "TXN" + String(maxNum + 1).padStart(2, "0");
}

function isTxnIdGreaterThan(idA, idB) {
  if (!idA) return false;
  if (!idB) return true;
  const numA = parseInt(idA.replace("TXN", ""), 10);
  const numB = parseInt(idB.replace("TXN", ""), 10);
  return numA > numB;
}

function nextUserId() {
  const users = getUsers();
  let maxNum = 0;
  users.forEach(u => {
    const num = parseInt(u.id.replace("USR", ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return "USR" + String(maxNum + 1).padStart(2, "0");
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (!el) return;

  const numVal = (typeof val === 'number') ? val : parseFloat(String(val).replace(/,/g, ''));

  if (!isNaN(numVal) && Number.isFinite(numVal) && String(val).trim() !== "") {
    // Prevent re-animating if it's already at the target number
    const currentNum = parseFloat(el.textContent.replace(/,/g, ''));
    if (currentNum === numVal) return;

    const duration = 1000; // 1 second dramatic spin-up
    const startTime = performance.now();
    const isFormatted = typeof val === 'string' && val.includes(',');

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart easing for a smooth slow-down effect
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(easeProgress * numVal);

      el.textContent = isFormatted ? current.toLocaleString() : current;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = val; // Lock in precise final formatting
      }
    };
    requestAnimationFrame(step);
  } else {
    el.textContent = val; // Fallback for pure strings (e.g. user names)
  }
}

function getShortName() {
  return localStorage.getItem("displayName") || "Unknown";
}

function getDateStr() {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()}`;
}

function getTimeStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// =============================================
//  TOAST NOTIFICATION SYSTEM (with Undo)
// =============================================
function ensureToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function showToast(type, title, msg, duration = 4000, onUndo = null) {
  const container = ensureToastContainer();
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let undoHtml = '';
  if (onUndo) {
    undoHtml = `<button class="secondary-btn undo-btn">Undo</button>`;
  }

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '📌'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>
    ${undoHtml}
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  let timeoutId;

  const dismiss = () => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', () => {
    clearTimeout(timeoutId);
    dismiss();
  });

  if (onUndo) {
    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.addEventListener('click', () => {
      clearTimeout(timeoutId);
      onUndo();
      dismiss();
    });
  }

  timeoutId = setTimeout(dismiss, duration);
}


// =============================================
//  LOGIN & AUTH
// =============================================
async function login() {
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const btn = document.querySelector(".sign-in-btn");

  const username = usernameEl.value.trim();
  const password = passwordEl.value.trim();

  if (!username || !password) {
    triggerLoginError();
    return;
  }

  // Active Loading State
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="lucide-icon" data-lucide="loader"></i> Authenticating...';
  if (window.lucide) window.lucide.createIcons({ root: btn });

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      // Signed token — required on every subsequent API request.
      if (data.token) localStorage.setItem("authToken", data.token);
      localStorage.setItem("userRole", data.user.role);
      localStorage.setItem("displayName", data.user.name);
      localStorage.setItem("userId", data.user.id);
      // Branch context. Staff are pinned to their branch; admins start on "all".
      if (data.user.branchId) localStorage.setItem("branchId", data.user.branchId);
      else localStorage.removeItem("branchId");
      if (data.user.branchName) localStorage.setItem("branchName", data.user.branchName);
      else localStorage.removeItem("branchName");
      setAdminBranch("all");
      if (data.user.mustChangePassword) {
        // Do NOT redirect yet — force the user to change their password first
        localStorage.setItem("mustChangePassword", "true");
        restoreLoginBtn(btn, originalText);
        showMustChangeModal();
      } else {
        localStorage.removeItem("mustChangePassword");
        window.location.href = "dashboard.html";
        // We don't restore the button here because the page is redirecting
      }
    } else {
      triggerLoginError();
      restoreLoginBtn(btn, originalText);
    }
  } catch (e) {
    console.error("Login API Error", e);
    // API is down — cannot authenticate without backend
    showToast('error', 'Connection Error', 'Cannot connect to server. Please ensure the backend is running.');
    restoreLoginBtn(btn, originalText);
  }
}

function restoreLoginBtn(btn, text) {
  btn.disabled = false;
  btn.innerHTML = text;
}

function triggerLoginError() {
  const uGroup = document.getElementById("username")?.closest('.form-group');
  const pGroup = document.getElementById("password")?.closest('.form-group');
  if (uGroup) uGroup.classList.add('has-error');
  if (pGroup) pGroup.classList.add('has-error');
  showToast('error', 'Login Failed', 'Invalid username/password or inactive account.');
  setTimeout(() => {
    if (uGroup) uGroup.classList.remove('has-error');
    if (pGroup) pGroup.classList.remove('has-error');
  }, 3000);
}

// Allow Enter key to submit login form
function setupLoginEnterKey() {
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const handler = (e) => { if (e.key === "Enter") login(); };
  if (usernameEl) usernameEl.addEventListener("keydown", handler);
  if (passwordEl) passwordEl.addEventListener("keydown", handler);
}

// Password visibility toggle
function setupPasswordToggle() {
  const toggleBtn = document.getElementById("toggle-password");
  const passwordEl = document.getElementById("password");
  if (toggleBtn && passwordEl) {
    toggleBtn.addEventListener("click", () => {
      const isPassword = passwordEl.type === "password";
      passwordEl.type = isPassword ? "text" : "password";
      toggleBtn.innerHTML = isPassword
        ? '<i data-lucide="eye-off" class="lucide-icon"></i>'
        : '<i data-lucide="eye" class="lucide-icon"></i>';
      toggleBtn.title = isPassword ? "Hide Password" : "Show Password";
      if (window.lucide) window.lucide.createIcons({ root: toggleBtn });
    });
  }
}

// =============================================
//  ACCOUNT RECOVERY / FORGOT PASSWORD MODAL
// =============================================
function showRecoveryModal(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById('recovery-modal');
  if (!modal) return;

  // Reset the form to a clean state every time the modal opens
  const formWrap   = document.getElementById('forgot-pw-form-wrap');
  const successDiv = document.getElementById('forgot-pw-success');
  const unameInput = document.getElementById('fp-username');
  const reasonEl   = document.getElementById('fp-reason');
  const errMsg     = document.getElementById('fp-error-msg');
  const submitBtn  = document.getElementById('fp-submit-btn');

  if (formWrap)   formWrap.style.display   = '';
  if (successDiv) successDiv.style.display = 'none';
  if (unameInput) unameInput.value  = '';
  if (reasonEl)   reasonEl.value   = '';
  if (errMsg)   { errMsg.style.display = 'none'; errMsg.textContent = ''; }
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send" class="lucide-icon"></i> Submit Request';
  }

  modal.style.display = 'flex';
  if (window.lucide) window.lucide.createIcons({ nodes: [modal] });
}

function closeRecoveryModal() {
  const modal = document.getElementById('recovery-modal');
  if (modal) modal.style.display = 'none';
}

// Skeleton loading row generator
function skeletonRows(cols, count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += '<tr class="skeleton-row">';
    for (let j = 0; j < cols; j++) {
      const width = j === 0 ? 'tiny' : j === cols - 1 ? 'short' : '';
      html += `<td><div class="skeleton-bar ${width}"></div></td>`;
    }
    html += '</tr>';
  }
  return html;
}

// Styled confirm modal (replaces browser confirm())
function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById("confirm-action-modal");
  if (!modal) { if (confirm(message)) onConfirm(); return; }

  document.getElementById("confirm-action-title").textContent = title;
  document.getElementById("confirm-action-msg").textContent = message;
  modal.style.display = "flex";

  const closeModal = () => { modal.style.display = "none"; };
  document.getElementById("confirm-action-yes").onclick = () => {
    closeModal();
    onConfirm();
  };
  document.getElementById("confirm-action-no").onclick = closeModal;
  // Use scoped handler to avoid breaking other modals
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("userRole");
  localStorage.removeItem("displayName");
  localStorage.removeItem("userId");
  localStorage.removeItem("branchId");
  localStorage.removeItem("branchName");
  localStorage.removeItem("adminBranch");
  localStorage.removeItem("mustChangePassword"); // Clear forced change flag on logout
  sessionStorage.removeItem("welcomeShown");
  window.location.href = "index.html";
}

function confirmLogout() {
  const modal = document.getElementById("logout-modal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("logout-yes").onclick = () => logout();
  document.getElementById("logout-no").onclick = () => modal.style.display = "none";
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
}

function showWelcomeModal(name, role) {
  const modal = document.getElementById("welcome-modal");
  if (!modal) return;
  document.getElementById("modal-title").textContent = `Welcome, ${role === "admin" ? "Administrator" : "Staff"}!`;
  document.getElementById("modal-subtitle").textContent = name;
  modal.style.display = "flex";
  document.getElementById("close-modal").onclick = () => modal.style.display = "none";
  setTimeout(() => modal.style.display = "none", 3000);
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
}

function requireAuth() {
  const page = window.location.pathname.split("/").pop();
  const publicPages = ["index.html", ""];
  const userRole = localStorage.getItem("userRole");

  // A signed token is now required to reach any protected page. Missing token
  // (e.g. a stale pre-upgrade session) forces a fresh login.
  if (!publicPages.includes(page) && (!userRole || !getAuthToken())) {
    window.location.href = "index.html";
    return;
  }

  if (page === "users.html" && userRole !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  // On any protected page: if the user has a mustChangePassword flag set,
  // show the forced change modal so they cannot bypass it.
  if (!publicPages.includes(page) && localStorage.getItem("mustChangePassword") === "true") {
    requestAnimationFrame(() => showMustChangeModal());
  }
}

// Render the branch context UI: an interactive switcher for admins, a fixed
// label for staff. Mounts into #branch-switch-bar (present on the dashboard).
function renderBranchContext() {
  const bar = document.getElementById("branch-switch-bar");
  if (!bar) return;
  const role = getUserRole();

  if (role === "admin") {
    const sel = getAdminBranch();
    const opts = [`<option value="all">Consolidated (All Branches)</option>`]
      .concat(appBranches.map(b =>
        `<option value="${b.id}" ${b.id === sel ? "selected" : ""}>${escapeHtml(b.name)} Branch Summary</option>`
      )).join("");
    bar.innerHTML = `
      <div class="branch-switch">
        <span class="branch-switch__label"><i data-lucide="git-branch" class="lucide-icon"></i> Viewing</span>
        <select id="branch-select" class="branch-switch__select" onchange="onBranchSwitch(this.value)">${opts}</select>
      </div>`;
  } else if (role === "staff") {
    const label = localStorage.getItem("branchName") || branchName(getMyBranchId());
    bar.innerHTML = `
      <div class="branch-switch branch-switch--fixed">
        <span class="branch-switch__label"><i data-lucide="map-pin" class="lucide-icon"></i> Branch</span>
        <span class="branch-switch__pill">${escapeHtml(label)}</span>
      </div>`;
  }
  if (window.lucide) window.lucide.createIcons({ root: bar });
}

// Admin changed the branch view → persist and reload so every page section
// re-fetches its data scoped to the chosen branch.
function onBranchSwitch(value) {
  setAdminBranch(value);
  window.location.reload();
}

function setActiveNav() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar nav a").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === page);
  });
}


// =============================================
//  USER MANAGEMENT
// =============================================
let currentDeleteUserId = null;

function loadUsers() {
  const users = getUsers();
  const activeCount = users.filter(u => u.status === "Active").length;

  const activeEl = document.querySelector(".stat-card.success .stat-number");
  const totalEl = document.querySelector(".stat-card:not(.success) .stat-number");
  if (activeEl) activeEl.textContent = activeCount;
  if (totalEl) totalEl.textContent = users.length;

  renderUserTable(users);
}

function renderUserTable(users) {
  const tbody = document.getElementById("users-body");
  if (!tbody) return;
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--slate-400);">No users found.</td></tr>`;
    return;
  }

  const currentUserId = localStorage.getItem("userId");

  tbody.innerHTML = users.map(u => {
    const statusClass = u.status === "Active" ? "in" : "out";

    // Delete button — disabled for self to prevent lockout
    const deleteBtn = u.id !== currentUserId
      ? `<button class="action-icon-btn danger" onclick="deleteUser('${u.id}')" title="Delete User"><i data-lucide="trash-2" class="lucide-icon"></i></button>`
      : `<button class="action-icon-btn danger" disabled title="Cannot delete yourself" style="opacity:0.5;cursor:not-allowed;"><i data-lucide="trash-2" class="lucide-icon"></i></button>`;

    const toggleIcon  = u.status === "Active" ? "lock" : "unlock";
    const toggleTitle = u.status === "Active" ? "Deactivate User" : "Activate User";
    const toggleBtn   = u.id !== currentUserId
      ? `<button class="action-icon-btn" onclick="toggleUserStatus('${u.id}')" title="${toggleTitle}"><i data-lucide="${toggleIcon}" class="lucide-icon"></i></button>`
      : `<button class="action-icon-btn" disabled title="Cannot change own status" style="opacity:0.5;cursor:not-allowed;"><i data-lucide="${toggleIcon}" class="lucide-icon"></i></button>`;

    // Reset password button — admin cannot reset their own via this route
    const resetPwBtn = u.id !== currentUserId
      ? `<button class="action-icon-btn warning" onclick="adminResetUserPassword('${u.id}', '${u.username}')" title="Reset Password for ${u.username}"><i data-lucide="key-round" class="lucide-icon"></i></button>`
      : `<button class="action-icon-btn warning" disabled title="Use account settings to change your own password" style="opacity:0.5;cursor:not-allowed;"><i data-lucide="key-round" class="lucide-icon"></i></button>`;

    // Reset-requested badge & reason snippet — visible only in Admin portal
    const resetBadgeAndReason = u.resetRequested
      ? `<div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">
           <span class="reset-req-badge" onclick="showResetReasonById('${u.id}')" title="Click to view full reset details">
             <i data-lucide="alert-circle" class="lucide-icon" style="width:12px;height:12px;"></i>
             Reset Requested
           </span>
           ${u.resetReason ? `<div class="staff-reason-snippet" onclick="showResetReasonById('${u.id}')" title="Click to expand details"><i data-lucide="message-square" class="lucide-icon" style="width:11px;height:11px;flex-shrink:0;"></i> <span>Reason: &ldquo;${escapeHtml(u.resetReason)}&rdquo;</span></div>` : ''}
         </div>`
      : '';

    return `
      <tr class="${u.resetRequested ? 'reset-requested-row' : ''}">
        <td>${u.id}</td>
        <td>
          <div style="font-weight: 600; color: var(--navy-800);">${escapeHtml(u.name)}</div>
          ${resetBadgeAndReason}
        </td>
        <td>${escapeHtml(u.username)}</td>
        <td style="text-transform:capitalize;">${u.role}</td>
        <td>${u.role === "admin" ? '<span style="color:var(--slate-400);">All branches</span>' : escapeHtml(branchName(u.branchId))}</td>
        <td><span class="status ${statusClass}">${u.status}</span></td>
        <td style="white-space:nowrap;">
          ${resetPwBtn}
          ${toggleBtn}
          ${deleteBtn}
        </td>
      </tr>`;
  }).join("");

  if (window.lucide) window.lucide.createIcons();
}

function setupUserManagement() {
  const searchInput = document.getElementById("user-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase();
      const users = getUsers().filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
      renderUserTable(users);
    });
  }

  const form = document.getElementById("create-user-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFormErrors(form);

      const nameEl = document.getElementById("cu-name");
      const userEl = document.getElementById("cu-username");
      const passEl = document.getElementById("cu-password");
      const roleEl = document.getElementById("cu-role");
      const branchEl = document.getElementById("cu-branch");

      const name = nameEl.value.trim();
      const username = userEl.value.trim();
      const password = passEl.value;
      const role = roleEl.value;
      // Admins are branch-agnostic; staff MUST be assigned to a branch.
      const branchId = role === "admin" ? null : (branchEl ? branchEl.value : "");

      const users = getUsers();
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        setFieldError(userEl, "Username already exists.");
        return;
      }
      if (role === "staff" && !branchId) {
        if (branchEl) setFieldError(branchEl, "Please assign a branch for this staff account.");
        return;
      }

      const payload = { id: nextUserId(), name, username, password, role, status: "Active", branchId };
      try {
        await fetch(`${API_URL}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        appUsers.push(payload);
        showToast('success', 'User Created', `${name} added successfully.`);
        closeCreateUserModal();
        loadUsers();
      } catch (err) {
        showToast('error', 'API Error', 'Failed to create user.');
      }
    });

    document.getElementById("cu-cancel").onclick = closeCreateUserModal;
  }
}

// Fill the branch dropdown from the loaded branch list.
function populateBranchDropdown() {
  const sel = document.getElementById("cu-branch");
  if (!sel) return;
  sel.innerHTML = `<option value="">Select a branch…</option>` +
    appBranches.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
}

// Show/hide the (mandatory) branch field depending on the chosen role.
function onCreateUserRoleChange(role) {
  const group = document.getElementById("cu-branch-group");
  if (group) group.style.display = role === "admin" ? "none" : "";
}

function openCreateUserModal() {
  const modal = document.getElementById("create-user-modal");
  if (modal) {
    const form = document.getElementById("create-user-form");
    form.reset();
    clearFormErrors(form);
    populateBranchDropdown();
    onCreateUserRoleChange(document.getElementById("cu-role").value);
    modal.style.display = "flex";
  }
}

function closeCreateUserModal() {
  const modal = document.getElementById("create-user-modal");
  if (modal) modal.style.display = "none";
}

async function deleteUser(id) {
  const users = getUsers();
  const userToDelete = users.find(u => u.id === id);

  if (userToDelete && userToDelete.id === localStorage.getItem("userId")) {
    showToast('error', 'Action Denied', 'You cannot delete your own active account.');
    return;
  }

  if (userToDelete && userToDelete.role === "admin") {
    const adminCount = users.filter(u => u.role === "admin").length;
    if (adminCount <= 1) {
      showToast('error', 'Action Denied', 'Cannot delete the only remaining administrator account.');
      return;
    }
  }

  showConfirmModal("Delete User", `Are you sure you want to delete user ${id}? This action cannot be undone.`, async () => {
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      appUsers = appUsers.filter(u => u.id !== id);
      showToast('success', 'User Deleted', `User ${id} has been removed.`);
      loadUsers();
    } catch (err) {
      showToast('error', 'API Error', 'Failed to delete user.');
    }
  });
}

async function toggleUserStatus(id) {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user) return;

  const newStatus = user.status === "Active" ? "Inactive" : "Active";

  // Prevent deactivating the last active admin
  if (newStatus === "Inactive" && user.role === "admin") {
    const activeAdmins = users.filter(u => u.role === "admin" && u.status === "Active");
    if (activeAdmins.length <= 1) {
      showToast('error', 'Action Denied', 'Cannot deactivate the only remaining active administrator.');
      return;
    }
  }

  const action = newStatus === "Active" ? "activate" : "deactivate";
  showConfirmModal("Change Status", `Are you sure you want to ${action} user ${user.name}?`, async () => {
    try {
      await fetch(`${API_URL}/users/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      user.status = newStatus;
      showToast('success', 'Status Updated', `${user.name} is now ${newStatus}.`);
      loadUsers();
    } catch (err) {
      showToast('error', 'API Error', 'Failed to update user status.');
    }
  });
}

function viewCredentials(id) {
  const user = getUsers().find(u => u.id === id);
  if (!user) return;
  const modal = document.getElementById("view-creds-modal");
  if (modal) {
    document.getElementById("vc-name").textContent = user.name;
    document.getElementById("vc-username").textContent = user.username;
    // SECURITY OVERRIDE: Displaying plaintext password directly from the user object as requested
    document.getElementById("vc-password").textContent = user.password || "Unavailable";
    document.getElementById("view-creds-modal").style.display = "flex";

    document.getElementById("vc-close").onclick = () => modal.style.display = "none";
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
  }
}



// =============================================
//  FORGOT PASSWORD REQUEST (Staff → Admin)
// =============================================

/**
 * Called when staff submits the Forgot Password form on the login screen.
 * Sends a reset request to the backend which flags the user for the Admin.
 */
async function submitForgotPassword() {
  const usernameEl = document.getElementById('fp-username');
  const reasonEl   = document.getElementById('fp-reason');
  const errMsg     = document.getElementById('fp-error-msg');
  const submitBtn  = document.getElementById('fp-submit-btn');
  const formWrap   = document.getElementById('forgot-pw-form-wrap');
  const successDiv = document.getElementById('forgot-pw-success');

  const username = usernameEl ? usernameEl.value.trim() : '';
  const reason   = reasonEl   ? reasonEl.value.trim()   : '';

  // Clear previous error
  if (errMsg) { errMsg.style.display = 'none'; errMsg.textContent = ''; }

  if (!username) {
    if (errMsg) { errMsg.textContent = 'Please enter your username.'; errMsg.style.display = 'block'; }
    if (usernameEl) usernameEl.focus();
    return;
  }

  // Loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-circle" class="lucide-icon"></i> Submitting...';
    if (window.lucide) window.lucide.createIcons({ nodes: [submitBtn] });
  }

  try {
    const res = await fetch(`${API_URL}/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, reason })
    });

    // Always show success (backend uses generic response to prevent enumeration)
    if (res.ok) {
      if (formWrap)   formWrap.style.display   = 'none';
      if (successDiv) {
        successDiv.style.display = 'block';
        if (window.lucide) window.lucide.createIcons({ nodes: [successDiv] });
      }
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || 'Failed to submit request. Please try again.';
      if (errMsg) { errMsg.textContent = msg; errMsg.style.display = 'block'; }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="send" class="lucide-icon"></i> Submit Request';
      }
    }
  } catch (e) {
    if (errMsg) { errMsg.textContent = 'Cannot connect to server. Please try again later.'; errMsg.style.display = 'block'; }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="send" class="lucide-icon"></i> Submit Request';
    }
  }
}

// =============================================
//  ADMIN — RESET USER PASSWORD
// =============================================

/**
 * Called when an Admin clicks the "Reset Password" (key) button in the user table.
 * Prompts for confirmation, calls the API, and displays the generated temp password.
 */
async function adminResetUserPassword(userId, username) {
  showConfirmModal(
    'Reset Password',
    `Generate a temporary password for "${username}"? They will be required to set a new password on their next login.`,
    async () => {
      const requesterId = localStorage.getItem('userId');
      try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId })
        });
        const data = await res.json();
        if (res.ok && data.temporaryPassword) {
          showTempPasswordModal(username, data.temporaryPassword);
          // Optimistically update the local cache so the badge clears immediately
          const u = appUsers.find(u => u.id === userId);
          if (u) { u.resetRequested = false; u.resetReason = ''; u.mustChangePassword = true; }
        } else {
          showToast('error', 'Reset Failed', data.error || 'Failed to reset password.');
        }
      } catch (err) {
        showToast('error', 'API Error', 'Failed to reset password. Check your connection.');
      }
    }
  );
}

/** Display the generated temp password in the dedicated modal. */
function showTempPasswordModal(username, tempPassword) {
  const modal    = document.getElementById('temp-password-modal');
  const label    = document.getElementById('tp-username-label');
  const display  = document.getElementById('tp-password-display');
  const copyBtn  = document.getElementById('tp-copy-btn');

  if (!modal) return;
  if (label)   label.textContent   = username;
  if (display) display.textContent = tempPassword;

  // Reset copy button to default state
  if (copyBtn) {
    copyBtn.classList.remove('copied');
    copyBtn.innerHTML = '<i data-lucide="clipboard" class="lucide-icon"></i> Copy to Clipboard';
  }

  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) closeTempPasswordModal(); };
  if (window.lucide) window.lucide.createIcons({ nodes: [modal] });
}

function closeTempPasswordModal() {
  const modal = document.getElementById('temp-password-modal');
  if (modal) modal.style.display = 'none';
  loadUsers(); // Refresh table to clear the Reset Requested badge
}

/** Copy the displayed temp password to the clipboard. */
function copyTempPassword() {
  const display = document.getElementById('tp-password-display');
  const copyBtn = document.getElementById('tp-copy-btn');
  if (!display) return;

  navigator.clipboard.writeText(display.textContent || '').then(() => {
    if (copyBtn) {
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = '<i data-lucide="check" class="lucide-icon"></i> Copied!';
      if (window.lucide) window.lucide.createIcons({ nodes: [copyBtn] });
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = '<i data-lucide="clipboard" class="lucide-icon"></i> Copy to Clipboard';
        if (window.lucide) window.lucide.createIcons({ nodes: [copyBtn] });
      }, 2500);
    }
    showToast('success', 'Copied!', 'Temporary password copied to clipboard.');
  }).catch(() => {
    showToast('warning', 'Copy Failed', 'Please manually select and copy the password above.');
  });
}

// =============================================
//  RESET REASON VIEWER
// =============================================

/** Look up a user by their ID and show their reset reason. */
function showResetReasonById(userId) {
  const user = getUsers().find(u => u.id === userId);
  if (!user) return;
  showResetReasonModal(user.username, user.resetReason);
}

/** Show the Reset Reason modal with the employee's submitted reason text. */
function showResetReasonModal(username, reason) {
  const modal      = document.getElementById('reset-reason-modal');
  const unameEl    = document.getElementById('rr-username');
  const reasonEl   = document.getElementById('rr-reason');

  if (!modal) {
    // Graceful fallback if modal is somehow absent
    alert(`Reset request from "${username}":\n\n${reason || 'No reason provided.'}`);
    return;
  }

  if (unameEl) unameEl.textContent = username;
  if (reasonEl) reasonEl.textContent = reason ? reason.trim() : 'No reason provided.';

  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  if (window.lucide) window.lucide.createIcons({ nodes: [modal] });
}

// =============================================
//  FORCED CHANGE PASSWORD (mustChangePassword flow)
// =============================================

/**
 * Ensures the #must-change-modal exists in the DOM.
 * If the user is on the login page (index.html), the modal is already in the HTML.
 * For all other pages it is injected dynamically so we don't duplicate HTML everywhere.
 */
/**
 * Ensures the #must-change-modal exists in the DOM.
 * If the user is on the login page (index.html), the modal is already in the HTML.
 * For all other pages it is injected dynamically so we don't duplicate HTML everywhere.
 */
function ensureMustChangeModal() {
  if (document.getElementById('must-change-modal')) return; // Already present

  document.body.insertAdjacentHTML('beforeend', `
    <div id="must-change-modal" class="modal must-change-overlay" style="display:none;">
      <div class="modal-content" style="max-width:460px;text-align:left;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:68px;height:68px;background:rgba(245,158,11,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
            <i data-lucide="shield-alert" class="lucide-icon" style="width:34px;height:34px;color:var(--amber-600);"></i>
          </div>
          <h2 style="margin:0 0 6px;font-size:20px;">Security Update Required</h2>
          <p style="font-size:13.5px;color:var(--slate-500);margin:0;">You are using a <strong>temporary password</strong>. Please set a new permanent password to continue.</p>
        </div>
        <form id="must-change-form" onsubmit="submitChangePassword(event); return false;">
          <div class="form-group with-icon" id="mcp-group-old">
            <label for="mcp-old-password">Current (Temporary) Password</label>
            <div class="input-icon-wrapper password-wrapper">
              <i data-lucide="lock" class="input-icon"></i>
              <input type="password" id="mcp-old-password" placeholder="Enter the temporary password" autocomplete="current-password">
              <button type="button" class="toggle-password" onclick="toggleMcpField('mcp-old-password', this)" title="Show/Hide">
                <i data-lucide="eye" class="lucide-icon"></i>
              </button>
            </div>
            <span class="error-msg" id="mcp-old-err"></span>
          </div>
          <div class="form-group with-icon" id="mcp-group-new">
            <label for="mcp-new-password">New Password</label>
            <div class="input-icon-wrapper password-wrapper">
              <i data-lucide="lock" class="input-icon"></i>
              <input type="password" id="mcp-new-password" placeholder="At least 4 characters" autocomplete="new-password">
              <button type="button" class="toggle-password" onclick="toggleMcpField('mcp-new-password', this)" title="Show/Hide">
                <i data-lucide="eye" class="lucide-icon"></i>
              </button>
            </div>
            <span class="error-msg" id="mcp-new-err"></span>
          </div>
          <div class="form-group with-icon" id="mcp-group-confirm">
            <label for="mcp-confirm-password">Confirm New Password</label>
            <div class="input-icon-wrapper password-wrapper">
              <i data-lucide="lock" class="input-icon"></i>
              <input type="password" id="mcp-confirm-password" placeholder="Re-enter new password" autocomplete="new-password">
              <button type="button" class="toggle-password" onclick="toggleMcpField('mcp-confirm-password', this)" title="Show/Hide">
                <i data-lucide="eye" class="lucide-icon"></i>
              </button>
            </div>
            <span class="error-msg" id="mcp-confirm-err"></span>
          </div>
          <p id="mcp-global-err" style="display:none;color:var(--red-600);font-size:13px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:10px 12px;margin-bottom:12px;"></p>
          <button type="submit" class="primary-btn" id="mcp-submit-btn" style="width:100%;margin-top:4px;">
            <i data-lucide="shield-check" class="lucide-icon"></i> Set New Password &amp; Continue
          </button>
          <p style="font-size:12px;color:var(--slate-400);text-align:center;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:5px;">
            <i data-lucide="info" class="lucide-icon" style="width:13px;height:13px;flex-shrink:0;"></i>
            This dialog cannot be dismissed. A new password must be set to access the system.
          </p>
        </form>
      </div>
    </div>`);
}

/** Show the forced change password modal. Always unclosable — no backdrop click, no X. */
function showMustChangeModal() {
  ensureMustChangeModal();
  const modal = document.getElementById('must-change-modal');
  if (!modal) return;

  // Clear any previous field values and errors
  ['mcp-old-password', 'mcp-new-password', 'mcp-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mcp-old-err', 'mcp-new-err', 'mcp-confirm-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  });
  ['mcp-group-old', 'mcp-group-new', 'mcp-group-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('has-error');
  });
  const globalErr = document.getElementById('mcp-global-err');
  if (globalErr) { globalErr.style.display = 'none'; globalErr.textContent = ''; }
  const submitBtn = document.getElementById('mcp-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="shield-check" class="lucide-icon"></i> Set New Password &amp; Continue';
  }

  modal.style.display = 'flex';
  // Intentionally NO backdrop click handler — this modal must NOT be dismissible
  if (window.lucide) window.lucide.createIcons({ root: modal });
}

/** Toggle show/hide for password fields inside the must-change modal. */
function toggleMcpField(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const nowText = input.type === 'password';
  input.type = nowText ? 'text' : 'password';
  btn.innerHTML = nowText
    ? '<i data-lucide="eye-off" class="lucide-icon"></i>'
    : '<i data-lucide="eye" class="lucide-icon"></i>';
  if (window.lucide) window.lucide.createIcons({ root: btn });
}

/**
 * Submits the new password to /api/auth/change-password.
 * On success: clears the mustChangePassword flag and redirects (login page)
 * or closes the modal (any other page).
 */
async function submitChangePassword(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  console.log('[ChangePassword] Form submit triggered.');

  const oldPwEl   = document.getElementById('mcp-old-password');
  const newPwEl   = document.getElementById('mcp-new-password');
  const confPwEl  = document.getElementById('mcp-confirm-password');
  const oldErr    = document.getElementById('mcp-old-err');
  const newErr    = document.getElementById('mcp-new-err');
  const confErr   = document.getElementById('mcp-confirm-err');
  const globalErr = document.getElementById('mcp-global-err');
  const submitBtn = document.getElementById('mcp-submit-btn');

  const oldGrp    = document.getElementById('mcp-group-old') || oldPwEl?.closest('.form-group');
  const newGrp    = document.getElementById('mcp-group-new') || newPwEl?.closest('.form-group');
  const confGrp   = document.getElementById('mcp-group-confirm') || confPwEl?.closest('.form-group');

  // Reset previous errors
  [oldGrp, newGrp, confGrp].forEach(grp => { if (grp) grp.classList.remove('has-error'); });
  [oldErr, newErr, confErr].forEach(el => { if (el) { el.textContent = ''; el.style.display = 'none'; } });
  if (globalErr) { globalErr.style.display = 'none'; globalErr.textContent = ''; }

  const oldPassword     = oldPwEl  ? oldPwEl.value.trim()  : '';
  const newPassword     = newPwEl  ? newPwEl.value.trim()  : '';
  const confirmPassword = confPwEl ? confPwEl.value.trim() : '';

  let valid = true;

  if (!oldPassword) {
    if (oldErr) { oldErr.textContent = 'Current (temporary) password is required.'; oldErr.style.display = 'block'; }
    if (oldGrp) oldGrp.classList.add('has-error');
    valid = false;
  }

  if (!newPassword || newPassword.length < 4) {
    if (newErr) { newErr.textContent = 'New password must be at least 4 characters long.'; newErr.style.display = 'block'; }
    if (newGrp) newGrp.classList.add('has-error');
    valid = false;
  }

  if (!confirmPassword) {
    if (confErr) { confErr.textContent = 'Please confirm your new password.'; confErr.style.display = 'block'; }
    if (confGrp) confGrp.classList.add('has-error');
    valid = false;
  } else if (newPassword !== confirmPassword) {
    if (confErr) { confErr.textContent = 'Passwords do not match. Please re-enter your new password.'; confErr.style.display = 'block'; }
    if (confGrp) confGrp.classList.add('has-error');
    if (globalErr) { globalErr.textContent = 'Passwords do not match. Please ensure both new password fields match.'; globalErr.style.display = 'block'; }
    valid = false;
  }

  if (oldPassword && newPassword && oldPassword === newPassword) {
    if (newErr) { newErr.textContent = 'New password must be different from current temporary password.'; newErr.style.display = 'block'; }
    if (newGrp) newGrp.classList.add('has-error');
    valid = false;
  }

  if (!valid) {
    console.warn('[ChangePassword] Validation failed:', { hasOld: !!oldPassword, hasNew: !!newPassword, passwordsMatch: newPassword === confirmPassword });
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const userId = localStorage.getItem('userId') || '';
  const username = localStorage.getItem('displayName') || document.getElementById('username')?.value || '';

  // Loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" class="lucide-icon spin"></i> Updating Password...';
    if (window.lucide) window.lucide.createIcons({ root: submitBtn });
  }

  try {
    console.log('[ChangePassword] Sending request to backend...', { userId, username });
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, oldPassword, newPassword })
    });

    const data = await res.json().catch(() => ({}));
    console.log('[ChangePassword] Backend response:', res.status, data);

    if (res.ok && data.success) {
      localStorage.removeItem('mustChangePassword');
      showToast('success', 'Password Updated', 'Your password has been changed successfully! Loading system...');

      const modal = document.getElementById('must-change-modal');
      if (modal) modal.style.display = 'none';

      const page = window.location.pathname.split('/').pop();
      if (page === 'index.html' || page === '') {
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
      }
    } else {
      const msg = data.error || data.message || 'Failed to update password. Please check your current password.';
      
      if (msg.toLowerCase().includes('current') || msg.toLowerCase().includes('incorrect')) {
        if (oldErr) { oldErr.textContent = msg; oldErr.style.display = 'block'; }
        if (oldGrp) oldGrp.classList.add('has-error');
      } else if (msg.toLowerCase().includes('differ') || msg.toLowerCase().includes('same')) {
        if (newErr) { newErr.textContent = msg; newErr.style.display = 'block'; }
        if (newGrp) newGrp.classList.add('has-error');
      }
      
      if (globalErr) {
        globalErr.textContent = msg;
        globalErr.style.display = 'block';
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="shield-check" class="lucide-icon"></i> Set New Password &amp; Continue';
        if (window.lucide) window.lucide.createIcons({ root: submitBtn });
      }
    }
  } catch (err) {
    console.error('[ChangePassword] Network error:', err);
    if (globalErr) {
      globalErr.textContent = 'Cannot reach the server. Please check your connection and try again.';
      globalErr.style.display = 'block';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="shield-check" class="lucide-icon"></i> Set New Password &amp; Continue';
      if (window.lucide) window.lucide.createIcons({ root: submitBtn });
    }
  }
}

// =============================================
//  DASHBOARD

// =============================================
function loadDashboard() {
  const products = getProducts();
  const txns = getTransactions();

  const threshold = getLowStockThreshold();
  const lowStock = products.filter(p => isProductLowStock(p)).length;
  const outStock = products.filter(p => p.quantity === 0).length;

  // Filter transactions by current month/year for "This Month" stats
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const thisMonthTxns = txns.filter(t => {
    const parts = t.date.split("/"); // DD/MM/YYYY format
    if (parts.length === 3) {
      const txnMonth = parseInt(parts[1], 10);
      const txnYear = parseInt(parts[2], 10);
      return txnMonth === currentMonth && txnYear === currentYear;
    }
    return false;
  });
  const stockInCount = thisMonthTxns.filter(t => t.type === "Stock In").length;
  const stockOutCount = thisMonthTxns.filter(t => t.type === "Stock Out").length;

  setText("total-products", products.length);
  setText("low-stock-count", lowStock);
  setText("stock-in-month", stockInCount);
  setText("stock-out-month", stockOutCount);

  // Total stock quantity (sum of all product quantities)
  const totalStockQty = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  setText("total-stock-qty", totalStockQty.toLocaleString());

  if (lowStock > 0 || outStock > 0) {
    const bannerId = "low-stock-banner";
    if (!document.getElementById(bannerId)) {
      const banner = document.createElement('div');
      banner.id = bannerId;
      const isUrgent = outStock > 0;
      banner.className = `alert-banner ${isUrgent ? 'alert-danger' : 'alert-warning'}`;
      const msg = outStock > 0
        ? `${outStock} item(s) out of stock and ${lowStock} item(s) running low.`
        : `${lowStock} item(s) are running low on stock.`;
      const bannerIcon = isUrgent ? 'alert-octagon' : 'alert-triangle';
      const bannerColor = isUrgent ? 'var(--red-500)' : 'var(--amber-500)';
      banner.innerHTML = `
          <div class="alert-content" style="display:flex; align-items:center;">
            <span class="alert-banner-icon"><i data-lucide="${bannerIcon}" class="lucide-icon" style="color:${bannerColor}; margin-right:8px;"></i></span>
            <span>${msg} Review your inventory to restock.</span>
          </div>
          <button class="alert-action" onclick="window.location.href='inventory.html'">View Inventory</button>
        `;
      const mainContent = document.querySelector('.main-content');
      const statsGrid = document.querySelector('.stats-grid');
      if (mainContent && statsGrid) {
        mainContent.insertBefore(banner, statsGrid);
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  const tbody = document.getElementById("recent-txn-body");
  if (tbody) {
    // Filter out transactions cleared by the user
    const clearedAfter = localStorage.getItem("clearDashRecentAfter") || "";
    const visibleTxns = clearedAfter
      ? txns.filter(t => isTxnIdGreaterThan(t.id, clearedAfter))
      : txns;
    const recent = visibleTxns.slice(-10).reverse();
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--slate-400); padding: 20px 0;">No transactions yet.</td></tr>';
    } else {
      tbody.innerHTML = recent.map(t => {
        const isIn = t.type === 'Stock In';
        const dotClass = isIn ? 'stock-in' : 'stock-out';
        const iconName = isIn ? 'package-plus' : 'package-minus';
        const verb = isIn ? 'added' : 'deducted';
        return `
          <tr>
            <td>${t.date}</td>
            <td>${t.time}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="timeline-dot ${dotClass}" style="width: 28px; height: 28px; font-size: 11px;"><i data-lucide="${iconName}" class="lucide-icon" style="width:12px;height:12px;margin-bottom:2px;"></i></div>
                <div style="text-align: left;">
                  <strong style="font-size: 13.5px; color: var(--navy-800);">${t.quantity} ${t.unit} of ${t.product} ${verb}</strong>
                  <div style="font-size: 11.5px; color: var(--slate-400); margin-top: 2px;">${t.category}</div>
                </div>
              </div>
            </td>
            <td>${t.user}</td>
          </tr>`;
      }).join("");
      if (window.lucide) window.lucide.createIcons({ root: tbody });
    }
  }

  // Backup & Restore Logic
  const btnDownload = document.getElementById("btn-download-backup");
  if (btnDownload) {
    btnDownload.addEventListener("click", () => {
      const data = {
        users: getUsers(),
        products: getProducts(),
        transactions: getTransactions()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhandol_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Backup Downloaded', 'System data backup successfully saved.');
    });
  }

  const btnRestore = document.getElementById("btn-restore-backup");
  const fileInput = document.getElementById("restore-file-input");
  if (btnRestore && fileInput) {
    btnRestore.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.users && data.products && data.transactions) {
            showConfirmModal("Restore Backup", "WARNING: This will overwrite ALL existing system data. Are you sure you want to restore?", async () => {
              await fetch(`${API_URL}/system/restore`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
              });
              showToast('success', 'Restore Complete', 'System data restored successfully. Reloading...', 3000);
              setTimeout(() => location.reload(), 1500);
            });
          } else {
            showToast('error', 'Restore Failed', 'Invalid backup file structure.');
          }
        } catch (err) {
          showToast('error', 'Restore Failed', 'Could not parse the backup file or communicate with backend.');
        }
        fileInput.value = ""; // reset
      };
      reader.readAsText(file);
    });
  }

  renderDashboardCharts(txns, products);


  // Bind the Out of Stock Toggle
  const toggleStockBtn = document.getElementById("toggle-out-of-stock");
  if (toggleStockBtn) {
    toggleStockBtn.addEventListener("change", () => renderDashboardCharts(txns, products));
  }

  // Clear Display button (dashboard) — persists via localStorage
  const btnClearTxns = document.getElementById("btn-clear-recent-txns");
  if (btnClearTxns) {
    btnClearTxns.addEventListener("click", () => {
      // Store the last TXN ID so on refresh, older items stay hidden
      const lastTxn = txns.length > 0 ? txns[txns.length - 1].id : "";
      if (lastTxn) localStorage.setItem("clearDashRecentAfter", lastTxn);
      const tbody = document.getElementById("recent-txn-body");
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--slate-400);">No transactions yet.</td></tr>';
      setText("stock-in-month", 0);
      setText("stock-out-month", 0);
      showToast('success', 'Display Cleared', 'Transaction history display has been cleared.');
    });
  }

  // Low Stock Threshold Setting
  setupLowStockThreshold();

  // Load export logs for admin
  if (localStorage.getItem("userRole") === "admin") {
    loadExportLogs();
  }

  // Clear Display button for Export Activity Log — persists via localStorage
  const btnClearExportLog = document.getElementById("btn-clear-export-log");
  if (btnClearExportLog) {
    btnClearExportLog.addEventListener("click", async () => {
      // Store the highest log ID so cleared state persists on refresh
      try {
        const res = await fetch(`${API_URL}/export-logs`);
        const logs = await res.json();
        if (logs.length > 0) {
          // Logs come DESC by createdAt, so first entry is the most recent.
          // Store its ISO timestamp so logs at or before this moment are hidden.
          localStorage.setItem("clearExportLogAfter", logs[0].createdAt || "");
        }
      } catch (e) { /* still clear the UI even if fetch fails */ }
      // Reset pagination state
      exportLogAllLogs = [];
      exportLogCurrentPage = 1;
      renderExportLogPage();
      showToast('success', 'Display Cleared', 'Export log display has been cleared.');
    });
  }

  // PDF Export button — uses window.print() with print-specific CSS
  const btnPdf = document.getElementById("btn-export-pdf");
  if (btnPdf) {
    btnPdf.addEventListener("click", () => {
      // Set print date for the report
      const desc = document.querySelector(".page-desc");
      if (desc) desc.setAttribute("data-print-date", new Date().toLocaleDateString());
      window.print();
      // Log the PDF export action
      fetch(`${API_URL}/export-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: getShortName(), type: "Dashboard PDF", date: getDateStr(), time: getTimeStr() })
      }).catch(err => console.error("Failed to log PDF export", err));
      showToast('success', 'PDF Export', 'Print dialog opened — choose "Save as PDF" for a PDF file.');
    });
  }
}

// =============================================
//  ACTIVITY HEATMAP (Phase 9)
// =============================================
function renderHeatmap(txns) {
  const heatmapDiv = document.getElementById("activity-heatmap");
  if (!heatmapDiv) return;

  // Generate last 30 days array
  const today = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const target = new Date(today);
    target.setDate(target.getDate() - i);
    days.push(target.toISOString().split('T')[0]);
  }

  // Count txns per day
  const counts = {};
  days.forEach(d => counts[d] = 0);

  txns.forEach(t => {
    try {
      const [dd, mm, yy] = t.date.split('/');
      const pDate = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      if (counts[pDate] !== undefined) counts[pDate]++;
    } catch (e) { }
  });

  const maxTxns = Math.max(...Object.values(counts));

  const getLevel = (count) => {
    if (count === 0) return 0;
    if (maxTxns <= 4) return count > 4 ? 4 : count; // 1:1 dynamic threshold for early dbs
    const ratio = count / maxTxns;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  heatmapDiv.innerHTML = days.map(d => {
    const count = counts[d];
    const level = getLevel(count);
    const rawDate = new Date(d);
    // Adjust timezone shifting
    const displayDate = new Date(rawDate.getTime() + rawDate.getTimezoneOffset() * 60000)
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="heatmap-cell" data-level="${level}" data-tooltip="${displayDate} — ${count} Transactions"></div>`;
  }).join("");
}

function renderDashboardCharts(txns, products) {
  const barCtx = document.getElementById("stockMovementChart");
  const pieCtx = document.getElementById("categoryPieChart");
  if (!barCtx || !pieCtx || typeof Chart === 'undefined') return;

  // Create Gradients for Bar Chart
  const createGradient = (ctx, colorStart, colorEnd) => {
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
  };

  const inGradient = createGradient(barCtx, 'rgba(34,197,94,0.9)', 'rgba(34,197,94,0.3)');
  const outGradient = createGradient(barCtx, 'rgba(239,68,68,0.9)', 'rgba(239,68,68,0.3)');

  const categories = [...new Set(products.map(p => p.category))];
  const includeOutOfStock = document.getElementById('toggle-out-of-stock') ? document.getElementById('toggle-out-of-stock').checked : true;

  const inData = categories.map(cat => txns.filter(t => t.category === cat && t.type === "Stock In").reduce((s, t) => s + t.quantity, 0));
  const outData = categories.map(cat => txns.filter(t => t.category === cat && t.type === "Stock Out").reduce((s, t) => s + t.quantity, 0));

  // --- Common Modern Tooltip Configuration ---
  const tooltipConfig = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)', // Slate 900
    titleFont: { family: 'Inter', size: 13, weight: '600' },
    bodyFont: { family: 'Inter', size: 12 },
    padding: 12,
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1
  };

  // ── Compute text color based on current theme ──
  const isDarkBar = document.body.classList.contains('dark-mode');
  const barTextColor = isDarkBar ? '#c8d6e5' : '#64748b';

  if (window.dashboardBarChart) window.dashboardBarChart.destroy();
  window.dashboardBarChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        { label: 'Stock In', data: inData, backgroundColor: inGradient, borderRadius: 6, minBarLength: 6, maxBarThickness: 40 },
        { label: 'Stock Out', data: outData, backgroundColor: outGradient, borderRadius: 6, minBarLength: 6, maxBarThickness: 40 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: barTextColor, font: { family: 'Inter', size: 12 }, padding: 20, usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          ...tooltipConfig,
          callbacks: {
            label: function (context) {
              return `  ${context.dataset.label}: ${context.raw} units`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: barTextColor }
        },
        y: {
          beginAtZero: true,
          ticks: { font: { family: 'Inter', size: 11 }, color: barTextColor, padding: 8 },
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [5, 5] },
          border: { display: false }
        }
      }
    }
  });

  const catCounts = {};
  products.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + p.quantity; });

  // Conditionally filter out zero-quantity categories based on toggle
  const filteredLabels = Object.keys(catCounts).filter(k => includeOutOfStock ? true : catCounts[k] > 0);
  const filteredData = filteredLabels.map(k => catCounts[k]);

  // Enforce a minimum visual slice so low quantities (e.g., 5 items out of 2000) don't disappear
  const totalStock = filteredData.reduce((a, b) => a + b, 0);
  const MIN_PIE_PCT = 0.06; // Minimum 6% visual slice to survive thick 4px borders

  const visualData = filteredData.map(val => {
    // If it's literally 0 and we are showing out-of-stock, give it a tiny sliver so it appears on the legend
    if (val === 0 && includeOutOfStock) return (totalStock > 0 ? totalStock * 0.02 : 1);
    return (totalStock > 0 && (val / totalStock) < MIN_PIE_PCT) ? (totalStock * MIN_PIE_PCT) : val;
  });

  // Use shared category color system (synced with table badges)
  const pieChartColors = filteredLabels.map(label => getCategoryColor(label));

  // Maintain high-contrast outlines (Dark outline in light mode, Light outline in dark mode)
  const isDark = document.body.classList.contains('dark-mode');
  const pieBorderColor = isDark
    ? getComputedStyle(document.body).getPropertyValue('--slate-800').trim()
    : getComputedStyle(document.body).getPropertyValue('--navy-800').trim();

  if (window.dashboardPieChart) window.dashboardPieChart.destroy();
  window.dashboardPieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: filteredLabels,
      datasets: [{
        data: visualData,
        realData: filteredData, // Store true mathematical data for precise tooltips
        backgroundColor: pieChartColors,
        borderWidth: 4,
        borderColor: pieBorderColor, // Distinct outline contrasting the background
        hoverBorderWidth: 4,
        hoverOffset: 6, // Emphasize hover effect
        spacing: 0,
        borderRadius: 0 // Flat edges for the gap
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%', // Thicker ring to match reference design
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: isDark ? '#c8d6e5' : '#64748b',
            font: { family: 'Inter', size: 12 },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          },
          onClick: function (event, legendItem, legend) {
            const categoryName = legendItem.text;
            const currentColor = legendItem.fillStyle;

            const pickerModal = document.getElementById("custom-color-picker");
            const pickerContent = pickerModal.querySelector(".modal-content");
            const colorInput = document.getElementById("ccp-input");
            const hexDisplay = document.getElementById("ccp-hex-display");
            const nameDisplay = document.getElementById("ccp-category-name");
            const saveBtn = document.getElementById("ccp-save");
            const cancelBtn = document.getElementById("ccp-cancel");

            if (!pickerModal) return;

            // Initialize the modal values
            nameDisplay.textContent = categoryName;
            const defaultHex = currentColor.startsWith("#") ? currentColor : "#000000";
            colorInput.value = defaultHex;
            hexDisplay.textContent = defaultHex;

            // Live update hex text when dragging the native picker inside the modal
            colorInput.oninput = (e) => hexDisplay.textContent = e.target.value;

            // Position the floating modal directly under the mouse cursor
            pickerModal.style.display = "flex";
            const bounds = pickerContent.getBoundingClientRect();

            // Basic viewport containment so it doesn't clip off the right/bottom edge
            let leftPos = event.native.clientX;
            let topPos = event.native.clientY + 15; // slightly offset from cursor

            if (leftPos + bounds.width > window.innerWidth) leftPos = window.innerWidth - bounds.width - 20;
            if (topPos + bounds.height > window.innerHeight) topPos = window.innerHeight - bounds.height - 20;

            pickerContent.style.left = `${leftPos}px`;
            pickerContent.style.top = `${topPos}px`;

            // Clean up old event listeners to prevent multi-binding bugs
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            newCancelBtn.onclick = () => pickerModal.style.display = "none";
            pickerModal.onclick = (e) => { if (e.target === pickerModal) pickerModal.style.display = "none"; };

            newSaveBtn.onclick = () => {
              const newColor = colorInput.value;
              let catMap = {};
              try { catMap = JSON.parse(localStorage.getItem('catColorMap_v2')) || {}; } catch (err) { }
              catMap[categoryName] = newColor;
              localStorage.setItem('catColorMap_v2', JSON.stringify(catMap));

              pickerModal.style.display = "none";
              renderDashboardCharts(getTransactions(), getProducts());
              showToast('success', 'Color Updated', `${categoryName} has been assigned a new color.`);
            };
          },
          onHover: function (event, legendItem, legend) {
            const chart = legend.chart;
            const index = legendItem.index;
            chart.tooltip.setActiveElements([{ datasetIndex: 0, index: index }], { x: event.x, y: event.y });
            chart.update();
          },
          onLeave: function (event, legendItem, legend) {
            const chart = legend.chart;
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update();
          }
        },
        tooltip: {
          ...tooltipConfig,
          usePointStyle: true, // Renders color indicator as a circle without thick borders
          boxPadding: 6,
          callbacks: {
            label: function (context) {
              // Read from realData to ensure mathematical precision regardless of visual inflation
              const realRaw = context.dataset.realData[context.dataIndex];
              const total = context.dataset.realData.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((realRaw / total) * 100).toFixed(1) : 0;
              return `  ${context.label}: ${realRaw} units (${pct}%)`;
            }
          }
        }
      }
    }
  });
}


// =============================================
//  ACTIVITY TIMELINE (Dashboard)
// =============================================
function renderActivityTimeline(txns) {
  const container = document.getElementById("activity-timeline");
  if (!container) return;

  const recent = txns.slice(-10).reverse();
  if (recent.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--slate-400); padding: 20px 0;">No recent activity.</div>';
    return;
  }

  container.innerHTML = recent.map(t => {
    const isIn = t.type === "Stock In";
    const dotClass = isIn ? "stock-in" : "stock-out";
    const iconName = isIn ? "package-plus" : "package-minus";
    const verb = isIn ? "added" : "deducted";
    return `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}"><i data-lucide="${iconName}" class="lucide-icon" style="width:14px;height:14px;margin-bottom:2px;"></i></div>
        <div class="timeline-body">
          <strong>${t.quantity} ${t.unit} of ${t.product} ${verb}</strong>
          <p>By ${t.user} · ${t.category}</p>
        </div>
        <div class="timeline-time">${t.date}<br>${t.time}</div>
      </div>`;
  }).join("");

  if (window.lucide) window.lucide.createIcons();
}

// =============================================
//  UPDATE ACTIVITY TIMELINE (called after transactions)
// =============================================
function updateActivityTimeline() {
  const txns = getTransactions();
  const dashClearedAfter = localStorage.getItem("clearDashRecentAfter") || "";
  // Bug Fix: was using plain string comparison `>` which breaks for TXN IDs > TXN9
  // Now uses isTxnIdGreaterThan() for correct numeric comparison
  const timelineTxns = dashClearedAfter ? txns.filter(t => isTxnIdGreaterThan(t.id, dashClearedAfter)) : txns;
  renderActivityTimeline(timelineTxns);
}

// =============================================
//  DASHBOARD STAT DETAIL MODALS
// =============================================
function openStatModal(type) {
  const modal = document.getElementById('stat-detail-modal');
  const title = document.getElementById('sdm-title');
  const thead = document.getElementById('sdm-thead');
  const tbody = document.getElementById('sdm-tbody');
  if (!modal || !title || !thead || !tbody) return;

  const content = document.getElementById('sdm-content');
  if (content) {
    content.classList.add('stat-modal-fullscreen');
  }

  const products = getProducts();
  const txns = getTransactions();

  title.innerHTML = `<i data-lucide="table-2" class="lucide-icon" style="margin-right:8px; vertical-align:middle;"></i> <span style="vertical-align:middle;">${type}</span>`;
  thead.innerHTML = '';
  tbody.innerHTML = '';

  let headers = [];
  let rows = [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isThisMonth = (dateStr) => {
    // format DD/MM/YYYY
    const [d, m, y] = dateStr.split('/');
    return parseInt(m) === currentMonth && parseInt(y) === currentYear;
  };

  if (type === 'Total Products') {
    headers = ['Product Name', 'Category', 'Stock Qty', 'Unit'];
    rows = products.map(p => `<tr>
      <td>${p.name}</td>
      <td>${typeof categoryBadge === 'function' ? categoryBadge(p.category) : p.category}</td>
      <td style="font-weight:600;">${p.quantity}</td>
      <td>${p.unit}</td>
    </tr>`);
  } else if (type === 'Total Stock Quantity') {
    headers = ['Category', 'Total Items in Stock'];
    const catCounts = {};
    products.forEach(p => catCounts[p.category] = (catCounts[p.category] || 0) + p.quantity);
    rows = Object.keys(catCounts).map(cat => `<tr>
      <td>${typeof categoryBadge === 'function' ? categoryBadge(cat) : cat}</td>
      <td style="font-weight:600;">${catCounts[cat]}</td>
    </tr>`);
  } else if (type === 'Low Stock Items') {
    headers = ['Product Name', 'Category', 'Current Stock', 'Min Threshold', 'Prediction'];
    // Dynamic: uses per-product min_threshold via isProductLowStock()
    const lowProds = products.filter(p => isProductLowStock(p) || p.quantity === 0);

    // Smart Restock Analytics (Phase 9.4)
    const today = new Date();
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyMs = thirtyAgo.getTime();

    rows = lowProds.map(p => {
      const isOut = p.quantity === 0;
      const color = isOut ? 'var(--red-600)' : 'var(--amber-600)';

      // Resolve per-product min threshold (same logic as isProductLowStock)
      const resolvedMin = (p.min_threshold !== undefined && p.min_threshold !== null && p.min_threshold !== '') ? parseInt(p.min_threshold, 10)
                        : (p.min_stock !== undefined && p.min_stock !== null && p.min_stock !== '') ? parseInt(p.min_stock, 10)
                        : (p.minStock !== undefined && p.minStock !== null && p.minStock !== '') ? parseInt(p.minStock, 10)
                        : (p.minThreshold !== undefined && p.minThreshold !== null && p.minThreshold !== '') ? parseInt(p.minThreshold, 10)
                        : null;
      const minThresholdDisplay = (!isNaN(resolvedMin) && resolvedMin > 0)
        ? `<span style="font-weight:600; color:var(--amber-600);">${resolvedMin}</span>`
        : `<span style="color:var(--slate-400); font-size:12px;">—</span>`;

      // Calculate 30-day velocity
      const pTxns = txns.filter(t => t.product === p.name && t.type === 'Stock Out');
      let outIn30Days = 0;
      pTxns.forEach(t => {
        try {
          const [d, m, y] = t.date.split('/');
          const tMs = new Date(`${y}-${m}-${d}`).getTime();
          if (tMs >= thirtyMs) outIn30Days += t.quantity;
        } catch (e) { }
      });

      const velocityPerDay = Math.max(0, outIn30Days / 30);

      let runoutHtml = '';
      if (isOut) {
        runoutHtml = `<span style="color:var(--red-600); font-weight:600;"><i data-lucide="alert-circle" class="lucide-icon" style="width:14px;height:14px;margin-bottom:-2px;"></i> Depleted</span>`;
      } else if (velocityPerDay === 0) {
        runoutHtml = `<span style="color:var(--slate-400); font-size:12px;">Stable (No recent sales)</span>`;
      } else {
        const daysLeft = Math.ceil(p.quantity / velocityPerDay);
        const estDate = new Date(today);
        estDate.setDate(estDate.getDate() + daysLeft);
        const displayDate = estDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        let estColor = 'var(--slate-600)';
        if (daysLeft <= 3) estColor = 'var(--red-600)';
        else if (daysLeft <= 7) estColor = 'var(--amber-600)';

        runoutHtml = `
          <div style="display:flex; flex-direction:column;">
            <span style="color:${estColor}; font-weight:600;">${displayDate}</span>
            <span style="color:var(--slate-400); font-size:11px;">~${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining</span>
          </div>
        `;
      }

      return `<tr>
        <td>${p.name}</td>
        <td>${typeof categoryBadge === 'function' ? categoryBadge(p.category) : p.category}</td>
        <td style="font-weight:600; color:${color};">${p.quantity}</td>
        <td>${minThresholdDisplay}</td>
        <td>${runoutHtml}</td>
      </tr>`;
    });
    if (rows.length === 0) rows = [`<tr><td colspan="5" style="text-align:center;color:var(--slate-400);padding:20px;">No low stock items.</td></tr>`];
  } else if (type === 'Stock In (This Month)' || type === 'Stock Out (This Month)') {
    headers = ['Date', 'Product', 'Category', 'Qty', 'User'];
    const isSumIn = type.includes('Stock In');
    const filterType = isSumIn ? 'Stock In' : 'Stock Out';
    const monthTxns = txns.filter(t => t.type === filterType && isThisMonth(t.date)).reverse();
    rows = monthTxns.map(t => {
      const color = isSumIn ? 'var(--green-600)' : 'var(--red-600)';
      return `<tr>
        <td>${t.date}</td>
        <td>${t.product}</td>
        <td>${typeof categoryBadge === 'function' ? categoryBadge(t.category) : t.category}</td>
        <td style="font-weight:600; color:${color};">${t.quantity} ${t.unit}</td>
        <td>${t.user}</td>
      </tr>`;
    });
    if (rows.length === 0) rows = [`<tr><td colspan="5" style="text-align:center;color:var(--slate-400);padding:20px;">No transactions this month.</td></tr>`];
  }

  // Inject headers
  thead.innerHTML = `<tr>${headers.map(h => `<th style="padding:14px 12px; font-size:12px; color:var(--slate-500); text-transform:uppercase;">${h}</th>`).join('')}</tr>`;

  // Inject body
  tbody.innerHTML = rows.join('');

  // Basic inline row styling just for this generic modal
  const trs = tbody.querySelectorAll('tr');
  trs.forEach(tr => {
    tr.style.borderBottom = "1px solid rgba(0,0,0,0.05)";
    tr.querySelectorAll('td').forEach((td, idx) => {
      if (!td.hasAttribute("colspan")) { // avoid overpadding empty messages
        td.style.padding = "16px 12px";
        td.style.fontSize = "13.5px";
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
  modal.style.display = 'flex';
}

function closeStatModal() {
  const modal = document.getElementById('stat-detail-modal');
  const content = document.getElementById('sdm-content');
  if (modal) modal.style.display = 'none';
  if (content) {
    content.classList.remove('stat-modal-fullscreen');
  }
}

function toggleStatModalFullscreen() {
  const content = document.getElementById('sdm-content');
  const icon = document.querySelector('#stat-detail-modal .maximize-btn .lucide-icon, #stat-detail-modal .icon-btn .lucide-icon');

  if (content) {
    content.classList.toggle('stat-modal-fullscreen');

    // Toggle icon between Maximize and Minimize (if Lucide is available)
    if (icon && window.lucide) {
      if (content.classList.contains('stat-modal-fullscreen')) {
        icon.setAttribute('data-lucide', 'minimize');
      } else {
        icon.setAttribute('data-lucide', 'maximize');
      }
      window.lucide.createIcons({ root: document.getElementById('stat-detail-modal') });
    }
  }
}

// =============================================
//  LOW STOCK THRESHOLD SETTING (Dashboard)
// =============================================
function setupLowStockThreshold() {
  const input = document.getElementById("low-stock-threshold");
  const saveBtn = document.getElementById("btn-save-threshold");
  const display = document.getElementById("current-threshold-display");
  if (!input || !saveBtn) return;

  // Bug Fix: guard against duplicate event listener registration on re-calls
  if (saveBtn.dataset.thresholdBound) return;
  saveBtn.dataset.thresholdBound = '1';

  // Load saved threshold from localStorage (synced from server on startup)
  const saved = getLowStockThreshold();
  input.value = saved;
  if (display) display.textContent = saved;

  // Inject the Low Stock Protection toggle into the panel dynamically
  const protectionContainer = document.getElementById("low-stock-protection-container");
  if (protectionContainer && !protectionContainer.dataset.rendered) {
    protectionContainer.dataset.rendered = '1';
    const isEnabled = getLowStockProtectionEnabled();
    protectionContainer.innerHTML = `
      <div class="protection-toggle-row">
        <div class="protection-toggle-info">
          <span class="protection-toggle-label">
            <i data-lucide="shield-check" class="lucide-icon" style="width:15px;height:15px;margin-right:6px;vertical-align:middle;"></i>
            Low Stock Protection
          </span>
          <span class="protection-toggle-desc">Block stock-out when quantity is at or below threshold</span>
        </div>
        <label class="lsp-switch" title="Toggle Low Stock Protection">
          <input type="checkbox" id="low-stock-protection-toggle" ${isEnabled ? 'checked' : ''}>
          <span class="lsp-slider"></span>
        </label>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: protectionContainer });

    const toggle = document.getElementById("low-stock-protection-toggle");
    if (toggle) {
      toggle.addEventListener("change", () => {
        // Optimistically update localStorage immediately
        localStorage.setItem("lowStockProtectionEnabled", String(toggle.checked));
        // Persist to server so it survives cross-device/session
        fetch(`${API_URL}/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: 'lowStockProtectionEnabled', value: String(toggle.checked) })
        }).catch(err => console.error("Failed to save protection setting", err));
      });
    }
  }

  saveBtn.addEventListener("click", () => {
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1 || val > 999) {
      showToast('error', 'Invalid Value', 'Threshold must be between 1 and 999.');
      return;
    }
    localStorage.setItem("lowStockThreshold", String(val));
    if (display) display.textContent = val;

    // Persist threshold to server so it's checked server-side during stock-out enforcement
    fetch(`${API_URL}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: 'lowStockThreshold', value: String(val) })
    }).catch(err => console.error("Failed to save threshold setting", err));

    // Also persist protection toggle state
    const toggleEl = document.getElementById('low-stock-protection-toggle');
    if (toggleEl) {
      localStorage.setItem("lowStockProtectionEnabled", String(toggleEl.checked));
      fetch(`${API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: 'lowStockProtectionEnabled', value: String(toggleEl.checked) })
      }).catch(err => console.error("Failed to save protection setting", err));
    }

    showToast('success', 'Settings Saved', `Low stock threshold set to ${val} units.`);
    // Refresh dashboard stats with new threshold
    const products = getProducts();
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= val).length;
    setText("low-stock-count", lowStock);
  });
}


// =============================================
//  EXPORT LOGS (Admin Dashboard) — Paginated
// =============================================
let exportLogAllLogs = [];
let exportLogCurrentPage = 1;
const EXPORT_LOG_PAGE_SIZE = 10;

function renderExportLogPage() {
  const tbody = document.getElementById("export-log-body");
  const pageInfo = document.getElementById("export-log-page-info");
  const prevBtn = document.getElementById("export-log-prev");
  const nextBtn = document.getElementById("export-log-next");
  if (!tbody) return;

  const totalPages = Math.ceil(exportLogAllLogs.length / EXPORT_LOG_PAGE_SIZE) || 1;
  if (exportLogCurrentPage > totalPages) exportLogCurrentPage = totalPages;

  const start = (exportLogCurrentPage - 1) * EXPORT_LOG_PAGE_SIZE;
  const pageLogs = exportLogAllLogs.slice(start, start + EXPORT_LOG_PAGE_SIZE);

  if (pageLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--slate-400);">No exports recorded yet.</td></tr>`;
  } else {
    tbody.innerHTML = pageLogs.map(l => `
      <tr>
        <td>${l.date}</td>
        <td>${l.time}</td>
        <td>${l.user}</td>
        <td>${l.type}</td>
      </tr>`).join("");
  }

  if (pageInfo) pageInfo.textContent = `Page ${exportLogCurrentPage} of ${totalPages}`;
  if (prevBtn) {
    prevBtn.disabled = exportLogCurrentPage <= 1;
    prevBtn.onclick = () => { if (exportLogCurrentPage > 1) { exportLogCurrentPage--; renderExportLogPage(); } };
  }
  if (nextBtn) {
    nextBtn.disabled = exportLogCurrentPage >= totalPages;
    nextBtn.onclick = () => { if (exportLogCurrentPage < totalPages) { exportLogCurrentPage++; renderExportLogPage(); } };
  }
  if (window.lucide) window.lucide.createIcons({ root: document.getElementById("export-log-card") });
}

async function loadExportLogs() {
  const tbody = document.getElementById("export-log-body");
  if (!tbody) return;
  try {
    const res = await fetch(`${API_URL}/export-logs`);
    const allLogs = await res.json();
    // Filter out logs that were cleared by the user (ISO timestamp-based)
    const clearedAfter = localStorage.getItem("clearExportLogAfter") || "";
    exportLogAllLogs = clearedAfter
      ? allLogs.filter(l => l.createdAt && l.createdAt > clearedAfter)
      : allLogs;
    exportLogCurrentPage = 1;
    renderExportLogPage();
  } catch (err) {
    console.error("Failed to load export logs", err);
  }
}


// =============================================
//  INVENTORY
// =============================================
let currentInvPage = 1;

function loadInventory() {
  const products = getProducts();
  const lowStockThreshold = getLowStockThreshold();
  const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= lowStockThreshold).length;

  setText("total-items-count", products.length);
  setText("low-stock-count", lowStock);

  // Total stock quantity (sum of all product quantities) — synced with dashboard
  const totalStockQty = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  setText("total-stock-qty-inv", totalStockQty.toLocaleString());


  // Populate category filter dynamically
  const catFilter = document.getElementById("inv-category");
  if (catFilter) {
    const currentVal = catFilter.value;
    const cats = [...new Set(products.map(p => p.category))].sort();
    catFilter.innerHTML = `<option>All Categories</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    // Restore previous selection to prevent layout flicker
    if (currentVal && cats.includes(currentVal)) {
      catFilter.value = currentVal;
    }
  }

  currentFilteredProducts = products;
  renderInventoryTable(products);
}

function renderInventoryTable(products) {
  const tbody = document.getElementById("inventory-body");
  if (!tbody) return;
  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px 0;">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--slate-400);">
            <i data-lucide="package-search" class="lucide-icon" style="width: 48px; height: 48px; color: var(--slate-300); margin-bottom: 16px;"></i>
            <h3 style="margin: 0 0 8px 0; color: var(--slate-500); font-weight: 500;">No Inventory Found</h3>
            <p style="margin: 0; font-size: 13px;">Adjust your search or filter settings to find what you're looking for.</p>
          </div>
        </td>
      </tr>`;
    if (window.lucide) window.lucide.createIcons();
    const info = document.getElementById("inv-page-info");
    if (info) info.textContent = "Page 1 of 1";
    return;
  }

  const userRole = localStorage.getItem("userRole");

  const itemsPerPage = 10;
  const totalPages = Math.ceil(products.length / itemsPerPage) || 1;
  if (currentInvPage > totalPages) currentInvPage = totalPages;
  const startIdx = (currentInvPage - 1) * itemsPerPage;
  const paginated = products.slice(startIdx, startIdx + itemsPerPage);

  const threshold = getLowStockThreshold();

  tbody.innerHTML = paginated.map(p => {
    const status = p.quantity === 0 ? "out-of-stock" : p.quantity <= threshold ? "low-stock" : "in-stock";
    const label = p.quantity === 0 ? "Out of Stock" : p.quantity <= threshold ? "Low Stock" : "In Stock";

    let actionCol = "";
    if (userRole === "admin") {
      actionCol = `
        <td class="admin-only" style="white-space: nowrap;">
          <button class="action-icon-btn" onclick="openEditProductModal('${p.id}')" title="Edit Product"><i data-lucide="pencil" class="lucide-icon"></i></button>
          <button class="action-icon-btn danger" onclick="deleteProduct('${p.id}')" title="Delete Product"><i data-lucide="trash-2" class="lucide-icon"></i></button>
        </td>`;
    } else {
      actionCol = `<td class="admin-only"></td>`;
    }

    return `
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${categoryBadge(p.category)}</td>
        <td>${p.unit}</td>
        <td>${p.quantity}</td>
        <td><span class="status ${status}">${label}</span></td>
        <td>${p.dateAdded}</td>
        <td>${p.user}</td>
        ${actionCol}
      </tr>`;
  }).join("");

  if (window.lucide) window.lucide.createIcons();

  const prevBtn = document.getElementById("inv-prev");
  const nextBtn = document.getElementById("inv-next");
  const info = document.getElementById("inv-page-info");
  if (prevBtn && nextBtn && info) {
    info.textContent = `Page ${currentInvPage} of ${totalPages}`;
    prevBtn.disabled = currentInvPage === 1;
    nextBtn.disabled = currentInvPage === totalPages;
    prevBtn.onclick = () => { if (currentInvPage > 1) { currentInvPage--; renderInventoryTable(currentFilteredProducts || getProducts()); } };
    nextBtn.onclick = () => { if (currentInvPage < totalPages) { currentInvPage++; renderInventoryTable(currentFilteredProducts || getProducts()); } };
  }
}

function setupInventoryFilters() {
  const searchInput = document.getElementById("inv-search");
  const catFilter = document.getElementById("inv-category");
  const stockFilter = document.getElementById("inv-stock-filter");
  const exportBtn = document.getElementById("export-btn");

  function applyFilters() {
    currentInvPage = 1;
    let products = getProducts();
    const q = (searchInput?.value || "").toLowerCase();
    const cat = catFilter?.value || "";
    const stock = stockFilter?.value || "";
    if (q) products = products.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    if (cat && cat !== "All Categories") products = products.filter(p => p.category === cat);
    if (stock === "Low Stock") products = products.filter(p => p.quantity > 0 && p.quantity <= getLowStockThreshold());
    if (stock === "Out of Stock") products = products.filter(p => p.quantity === 0);
    currentFilteredProducts = products;
    renderInventoryTable(products);
  }

  searchInput?.addEventListener("input", applyFilters);
  catFilter?.addEventListener("change", applyFilters);
  stockFilter?.addEventListener("change", applyFilters);
  exportBtn?.addEventListener("click", () => {
    exportCSV(currentFilteredProducts || getProducts(), ["id", "name", "category", "unit", "quantity", "dateAdded", "user"], "inventory.csv", "Inventory");
    showToast('success', 'Export Complete', 'Inventory data exported as CSV.');
  });

  const editForm = document.getElementById("edit-product-form");
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("ep-id").value;
      const idx = appProducts.findIndex(p => p.id === id);
      if (idx !== -1) {
        const payload = {
          name: document.getElementById("ep-name").value.trim(),
          category: document.getElementById("ep-category").value.trim(),
          quantity: parseInt(document.getElementById("ep-quantity").value),
          unit: document.getElementById("ep-unit").value
        };
        try {
          await fetch(`${API_URL}/inventory/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          appProducts[idx] = { ...appProducts[idx], ...payload };
          showToast('success', 'Product Updated', `${payload.name} updated successfully.`);
          closeEditProductModal();
          applyFilters();
          const low = appProducts.filter(p => p.quantity > 0 && p.quantity <= getLowStockThreshold()).length;
          setText("total-items-count", appProducts.length);
          setText("low-stock-count", low);
          // Keep total stock quantity in sync after edit
          const totalStockQty = appProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
          setText("total-stock-qty-inv", totalStockQty.toLocaleString());
        } catch (err) {
          showToast('error', 'API Error', 'Failed to update product.');
        }
      }
    });

    document.getElementById("ep-cancel").onclick = closeEditProductModal;
  }
}

function openEditProductModal(id) {
  const products = getProducts();
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  document.getElementById("ep-id").value = prod.id;
  document.getElementById("ep-name").value = prod.name;
  document.getElementById("ep-category").value = prod.category;
  document.getElementById("ep-quantity").value = prod.quantity;
  document.getElementById("ep-unit").value = prod.unit;

  const datalist = document.getElementById("ep-category-options");
  if (datalist) {
    const cats = [...new Set(products.map(p => p.category))];
    datalist.innerHTML = cats.map(c => `<option value="${c}">`).join("");
  }

  const modal = document.getElementById("edit-product-modal");
  if (modal) modal.style.display = "flex";
}

function closeEditProductModal() {
  const modal = document.getElementById("edit-product-modal");
  if (modal) modal.style.display = "none";
}

async function deleteProduct(id) {
  const prod = appProducts.find(p => p.id === id);
  if (!prod) return;

  showConfirmModal("Delete Product", `Are you sure you want to permanently delete ${prod.name}? This action cannot be undone.`, async () => {
    try {
      await fetch(`${API_URL}/inventory/${id}`, { method: "DELETE" });
      appProducts = appProducts.filter(p => p.id !== id);
      showToast('success', 'Product Deleted', `${prod.name} has been removed from inventory.`);
      loadInventory();
    } catch (err) {
      showToast('error', 'API Error', 'Failed to delete product.');
    }
  });
}

// =============================================
//  STOCK IN (with dynamic categories & Undo)
// =============================================
function setupStockIn() {
  const form = document.getElementById("stock-in-form");
  if (!form) return;

  const datalistCats = document.getElementById("category-options");
  const unitDatalist = document.getElementById("unit-options");
  const catDropdown = document.getElementById("si-category-dropdown");
  const unitDropdown = document.getElementById("si-unit-dropdown");

  const fallbackCategories = ["Electrical", "Lumber", "Paint & Coating", "Metals", "Fasteners"];
  const fallbackUnits = ["PCS", "ROLLS", "BUCKETS", "BOX", "METERS", "KG", "LITERS", "BAGS", "SETS", "PAIRS"];

  function renderCategoryDropdown(filterText = "") {
    if (!catDropdown) return;
    const existingCats = [...new Set(getProducts().map(p => p.category))];
    let allCats = [...new Set([...existingCats, ...fallbackCategories])];

    if (filterText) {
      allCats = allCats.filter(c => c.toLowerCase().includes(filterText.toLowerCase()));
    }

    if (allCats.length === 0) {
      catDropdown.innerHTML = `<div style="padding:10px; color:var(--slate-400); font-size:13px; text-align:center;">Press enter to use text</div>`;
      return;
    }

    catDropdown.innerHTML = allCats.map(c => `
      <div class="dropdown-item" data-val="${c}">
        <span class="item-main">${c}</span>
      </div>
    `).join("");

    catDropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.getElementById("si-category").value = el.getAttribute('data-val');
        catDropdown.classList.remove('show');
      });
    });
  }

  function renderUnitDropdown(filterText = "") {
    if (!unitDropdown) return;
    const existingUnits = [...new Set(getProducts().map(p => p.unit))];
    let allUnits = [...new Set([...existingUnits, ...fallbackUnits])];

    if (filterText) {
      allUnits = allUnits.filter(u => u.toLowerCase().includes(filterText.toLowerCase()));
    }

    if (allUnits.length === 0) {
      unitDropdown.innerHTML = `<div style="padding:10px; color:var(--slate-400); font-size:13px; text-align:center;">Press enter to use text</div>`;
      return;
    }

    unitDropdown.innerHTML = allUnits.map(u => `
      <div class="dropdown-item" data-val="${u}">
        <span class="item-main">${u}</span>
      </div>
    `).join("");

    unitDropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.getElementById("si-unit").value = el.getAttribute('data-val');
        unitDropdown.classList.remove('show');
      });
    });
  }

  const nameEl = document.getElementById("si-name");
  const catEl = document.getElementById("si-category");
  const unitEl = document.getElementById("si-unit");
  const previewBox = document.getElementById("si-preview");
  const productDropdown = document.getElementById("si-products-dropdown");

  function renderStockInDropdown(filterText = "") {
    if (!productDropdown) return;
    const products = getProducts();
    let matches = products.reduce((acc, p) => {
      if (!acc.find(item => item.name === p.name)) acc.push(p);
      return acc;
    }, []);

    if (filterText) {
      matches = matches.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()));
    }

    if (matches.length === 0) {
      productDropdown.innerHTML = `<div style="padding:10px; color:var(--slate-400); font-size:13px; text-align:center;">No existing products found</div>`;
      return;
    }

    productDropdown.innerHTML = matches.map(p => `
      <div class="dropdown-item" data-name="${p.name}">
        <span class="item-main">${p.name}</span>
        <span class="item-sub">${p.category}</span>
      </div>
    `).join("");

    productDropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        nameEl.value = el.getAttribute('data-name');
        nameEl.dispatchEvent(new Event('input'));
        productDropdown.classList.remove('show');
      });
    });
  }

  nameEl?.addEventListener("focus", () => {
    if (productDropdown) {
      renderStockInDropdown(nameEl.value);
      productDropdown.classList.add('show');
    }
  });

  nameEl?.addEventListener("blur", () => {
    setTimeout(() => { if (productDropdown) productDropdown.classList.remove('show'); }, 150);
  });

  nameEl?.addEventListener("input", (e) => {
    const val = e.target.value.trim().toLowerCase();

    if (productDropdown) {
      renderStockInDropdown(val);
      productDropdown.classList.add('show');
    }

    const match = getProducts().find(p => p.name.toLowerCase() === val);
    if (match) {
      catEl.value = match.category;
      unitEl.value = match.unit;
      catEl.disabled = true;
      unitEl.disabled = true;
      if (previewBox) {
        previewBox.style.display = "block";
        previewBox.textContent = `Current Stock: ${match.quantity} ${match.unit}`;
      }
    } else {
      catEl.disabled = false;
      unitEl.disabled = false;
      if (previewBox) previewBox.style.display = "none";
    }
  });

  catEl?.addEventListener("focus", () => {
    if (!catEl.disabled && catDropdown) {
      renderCategoryDropdown(catEl.value);
      catDropdown.classList.add('show');
    }
  });

  catEl?.addEventListener("blur", () => {
    setTimeout(() => { if (catDropdown) catDropdown.classList.remove('show'); }, 150);
  });

  catEl?.addEventListener("input", (e) => {
    if (!catEl.disabled && catDropdown) {
      renderCategoryDropdown(e.target.value.trim());
      catDropdown.classList.add('show');
    }
  });

  unitEl?.addEventListener("focus", () => {
    if (!unitEl.disabled && unitDropdown) {
      renderUnitDropdown(unitEl.value);
      unitDropdown.classList.add('show');
    }
  });

  unitEl?.addEventListener("blur", () => {
    setTimeout(() => { if (unitDropdown) unitDropdown.classList.remove('show'); }, 150);
  });

  unitEl?.addEventListener("input", (e) => {
    if (!unitEl.disabled && unitDropdown) {
      renderUnitDropdown(e.target.value.trim());
      unitDropdown.classList.add('show');
    }
  });

  let siSubmitting = false;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (siSubmitting) return;
    siSubmitting = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    clearFormErrors(form);

    const nameEl = document.getElementById("si-name");
    const catEl = document.getElementById("si-category");
    const unitEl = document.getElementById("si-unit");
    const qtyEl = document.getElementById("si-quantity");

    const name = nameEl.value.trim();
    const cat = catEl.value.trim();
    const unit = unitEl.value.trim();
    const qty = parseInt(qtyEl.value);

    let valid = true;
    if (!name || name.length === 0) { setFieldError(nameEl, "Product name is required."); valid = false; }
    if (!cat || cat.length < 2) { setFieldError(catEl, "Valid category required."); valid = false; }
    if (!unit || unit.length < 2) { setFieldError(unitEl, "Valid unit required."); valid = false; }
    if (isNaN(qty) || qty <= 0) { setFieldError(qtyEl, "Enter a valid quantity > 0."); valid = false; }
    if (!valid) { siSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }

    const dateStr = getDateStr();
    const timeStr = getTimeStr();
    const shortName = getShortName();

    const existingIndex = appProducts.findIndex(p => p.name.toLowerCase() === name.toLowerCase() && p.category.toLowerCase() === cat.toLowerCase());
    let txnProduct = name;
    let isNewProduct = false;
    let newId = null;
    let productPayload = null;
    let productAction = null; // 'POST' or 'PUT'

    if (existingIndex !== -1) {
      txnProduct = appProducts[existingIndex].name;
      newId = appProducts[existingIndex].id;
      productPayload = { quantityDelta: qty, user: shortName };
      productAction = 'PUT';
    } else {
      isNewProduct = true;
      newId = "PROD" + String(
        appProducts.reduce((max, p) => {
          const num = parseInt(p.id.replace("PROD", ""), 10);
          return (!isNaN(num) && num > max) ? num : max;
        }, 0) + 1
      ).padStart(2, "0");
      productPayload = { id: newId, name, category: cat, unit, quantity: qty, dateAdded: dateStr, user: shortName, branchId: writeBranchId() };
      productAction = 'POST';
    }

    const txnId = nextTxnId();
    const txnPayload = { id: txnId, product: txnProduct, category: cat, type: "Stock In", quantity: qty, unit, date: dateStr, time: timeStr, user: shortName, branchId: writeBranchId() };

    showStockInConfirm(txnProduct, cat, qty, existingIndex !== -1 ? appProducts[existingIndex].quantity : 0, unit, async function () {
      try {
        if (productAction === 'POST') {
          await fetch(`${API_URL}/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(productPayload) });
          appProducts.push(productPayload);
        } else {
          const siRes = await fetch(`${API_URL}/inventory/${newId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(productPayload) });
          if (!siRes.ok) {
            const errData = await siRes.json().catch(() => ({}));
            // ── THRESHOLD GOVERNANCE: Max-Capacity Block ──────────────────────
            if (errData.error === 'MAX_THRESHOLD_EXCEEDED' || errData.status === 'BLOCKED') {
              // Remove confirm modal immediately
              const confirmMod = document.getElementById('stock-in-confirm');
              if (confirmMod) confirmMod.style.display = 'none';
              // Inject or update blocked alert banner
              let alertBanner = document.getElementById('si-blocked-alert');
              if (!alertBanner) {
                alertBanner = document.createElement('div');
                alertBanner.id = 'si-blocked-alert';
                alertBanner.className = 'threshold-blocked-alert';
                const mainContent = document.querySelector('.main-content');
                const twoCol = document.querySelector('.two-column');
                if (mainContent && twoCol) mainContent.insertBefore(alertBanner, twoCol);
              }
              alertBanner.innerHTML = `
                <div class="tba-icon"><i data-lucide="shield-x" class="lucide-icon" style="width:22px;height:22px;"></i></div>
                <div class="tba-body">
                  <div class="tba-title">Stock-In Blocked — Max Capacity Exceeded</div>
                  <div class="tba-msg">${escapeHtml(errData.message || 'Transaction blocked by threshold governance.')}</div>
                  <a href="threshold.html" class="tba-cta">
                    <i data-lucide="sliders" class="lucide-icon" style="width:13px;height:13px;"></i>
                    Go to Threshold Management
                  </a>
                </div>
              `;
              alertBanner.style.display = 'flex';
              alertBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
              if (window.lucide) window.lucide.createIcons({ root: alertBanner });
              siSubmitting = false;
              if (submitBtn) submitBtn.disabled = false;
              return;
            }
            // Re-throw other errors to be caught by outer catch
            throw errData;
          }
          appProducts[existingIndex].quantity += qty;
          appProducts[existingIndex].user = shortName;
        }

        // Clear any previous blocked alert on success
        const prevAlert = document.getElementById('si-blocked-alert');
        if (prevAlert) prevAlert.style.display = 'none';

        await fetch(`${API_URL}/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(txnPayload) });
        appTxns.push(txnPayload);

        // Update activity timeline on dashboard if visible
        updateActivityTimeline();

        // Provide Undo functionality
        const onUndo = async () => {
          try {
            await fetch(`${API_URL}/transactions/${txnId}`, { method: "DELETE" });
            appTxns = appTxns.filter(t => t.id !== txnId);

            // Update activity timeline on dashboard
            updateActivityTimeline();

            if (isNewProduct) {
              await fetch(`${API_URL}/inventory/${newId}`, { method: "DELETE" });
              appProducts = appProducts.filter(p => p.id !== newId);
            } else {
              await fetch(`${API_URL}/inventory/${newId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityDelta: -qty }) });
              const pMatch = appProducts.find(p => p.id === newId);
              if (pMatch) pMatch.quantity -= qty;
            }
            showToast('info', 'Action Undone', `Stock In of ${qty} ${unit} ${txnProduct} was reverted.`, 3000);
            loadRecentStockIn();
          } catch (err) { showToast('error', 'API Error', 'Failed to undo.'); }
        };

        showToast('success', 'Stock Recorded', `${qty} ${unit} of ${txnProduct} added.`, 5000, onUndo);
        form.reset();

        const pBox = document.getElementById("si-preview");
        if (pBox) pBox.style.display = "none";
        const cEl = document.getElementById("si-category");
        const uEl = document.getElementById("si-unit");
        if (cEl) cEl.disabled = false;
        if (uEl) uEl.disabled = false;

        loadRecentStockIn();
      } catch (err) { showToast('error', 'API Error', 'Failed to record stock in.'); }
      finally { siSubmitting = false; if (submitBtn) submitBtn.disabled = false; }
    }, function () {
      siSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    });
  });

  document.getElementById("si-clear")?.addEventListener("click", () => {
    clearFormErrors(form);
    form.reset();
    const cEl = document.getElementById("si-category");
    const uEl = document.getElementById("si-unit");
    if (cEl) cEl.disabled = false;
    if (uEl) uEl.disabled = false;
    const pBox = document.getElementById("si-preview");
    if (pBox) pBox.style.display = "none";
  });

  // Clear Display button — persists via localStorage
  document.getElementById("btn-clear-recent-si")?.addEventListener("click", () => {
    const siTxns = getTransactions().filter(t => t.type === "Stock In");
    const lastId = siTxns.length > 0 ? siTxns[siTxns.length - 1].id : "";
    if (lastId) localStorage.setItem("clearStockInAfter", lastId);
    const list = document.getElementById("recent-stock-in");
    if (list) list.innerHTML = `<li style="color:var(--slate-400);">No recent stock ins.</li>`;
    showToast('success', 'Display Cleared', 'Recent stock in display has been cleared.');
  });

  loadRecentStockIn();
}

function loadRecentStockIn() {
  const list = document.getElementById("recent-stock-in");
  if (!list) return;
  const clearedAfter = localStorage.getItem("clearStockInAfter") || "";
  let siTxns = getTransactions().filter(t => t.type === "Stock In");
  if (clearedAfter) siTxns = siTxns.filter(t => isTxnIdGreaterThan(t.id, clearedAfter));
  const txns = siTxns.slice(-5).reverse();
  list.innerHTML = txns.length === 0
    ? `<li style="color:var(--slate-400);">No recent stock ins.</li>`
    : txns.map(t => `<li><strong>${t.product}</strong><br>Qty: ${t.quantity} ${t.unit}<br>${t.date} — ${t.user}</li>`).join("");
}

function showStockInConfirm(productName, category, qtyToAdd, currentQty, unit, onConfirm, onCancel) {
  const modal = document.getElementById("stock-in-confirm");
  if (!modal) { onConfirm(); return; }

  document.getElementById("confirm-si-product").textContent = productName;
  document.getElementById("confirm-si-qty").textContent = qtyToAdd + " " + unit;
  document.getElementById("confirm-si-total").textContent = (currentQty + qtyToAdd) + " " + unit;

  modal.style.display = "flex";

  document.getElementById("confirm-si-yes").onclick = function () {
    modal.style.display = "none";
    onConfirm();
  };
  const cancel = function () {
    modal.style.display = "none";
    if (onCancel) onCancel();
  };
  document.getElementById("confirm-si-no").onclick = cancel;
  modal.onclick = function (e) {
    if (e.target === modal) cancel();
  };
}


// =============================================
//  STOCK OUT (with confirmation & Undo)
// =============================================
function setupStockOut() {
  const form = document.getElementById("stock-out-form");
  const searchEl = document.getElementById("so-product-search");
  const idEl = document.getElementById("so-product-id");
  const datalist = document.getElementById("so-products");
  const unitBox = document.getElementById("so-unit");
  const previewBox = document.getElementById("so-preview");
  const qtyEl = document.getElementById("so-quantity");
  const qtyErr = document.getElementById("so-qty-err");
  if (!form) return;

  const productDropdown = document.getElementById("so-products-dropdown");

  function renderStockOutDropdown(filterText = "") {
    if (!productDropdown) return;
    const products = getProducts().filter(p => p.quantity > 0);
    let matches = products;

    if (filterText) {
      matches = matches.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(filterText.toLowerCase()));
    }

    if (matches.length === 0) {
      productDropdown.innerHTML = `<div style="padding:10px; color:var(--slate-400); font-size:13px; text-align:center;">No stock available to deduct</div>`;
      return;
    }

    productDropdown.innerHTML = matches.map(p => `
      <div class="dropdown-item" data-name="${p.name} - ${p.category}">
        <span class="item-main">${p.name}</span>
        <span class="item-sub">${p.quantity} ${p.unit}</span>
      </div>
    `).join("");

    productDropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        searchEl.value = el.getAttribute('data-name');
        searchEl.dispatchEvent(new Event('input'));
        productDropdown.classList.remove('show');
      });
    });
  }

  searchEl?.addEventListener("focus", () => {
    if (productDropdown) {
      renderStockOutDropdown(searchEl.value);
      productDropdown.classList.add('show');
    }
  });

  searchEl?.addEventListener("blur", () => {
    setTimeout(() => { if (productDropdown) productDropdown.classList.remove('show'); }, 150);
  });

  let maxAllowed = 0;
  searchEl?.addEventListener("input", (e) => {
    const val = e.target.value.trim().toLowerCase();

    if (productDropdown) {
      renderStockOutDropdown(val);
      productDropdown.classList.add('show');
    }

    const match = getProducts().find(p => `${p.name} - ${p.category}`.toLowerCase() === val);
    if (match) {
      idEl.value = match.id;
      unitBox.value = match.unit;
      maxAllowed = match.quantity;
      if (previewBox) {
        previewBox.style.display = "block";
        previewBox.style.color = match.quantity <= parseInt(localStorage.getItem('lowStockThreshold') || 10) ? 'var(--red-600)' : 'var(--blue-600)';
        previewBox.innerHTML = `Available Stock: <strong>${match.quantity} ${match.unit}</strong>`;
      }
      if (qtyEl) qtyEl.dispatchEvent(new Event('input'));
    } else {
      idEl.value = "";
      unitBox.value = "";
      maxAllowed = 0;
      if (previewBox) previewBox.style.display = "none";
    }
  });

  qtyEl?.addEventListener("input", (e) => {
    if (!idEl.value) return;
    const q = parseInt(e.target.value);
    if (q > maxAllowed) {
      qtyEl.style.borderColor = "var(--red-500)";
      if (qtyErr) { qtyErr.textContent = `Overdraft Warning: Only ${maxAllowed} available.`; qtyErr.style.display = "block"; }
    } else {
      qtyEl.style.borderColor = "var(--slate-300)";
      if (qtyErr) { qtyErr.textContent = ""; qtyErr.style.display = "none"; }
    }
  });

  let soSubmitting = false;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (soSubmitting) return;
    soSubmitting = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    clearFormErrors(form);

    const prodId = document.getElementById("so-product-id")?.value;
    const qtyEl = document.getElementById("so-quantity");
    const qty = parseInt(qtyEl.value);

    if (!prodId) {
      setFieldError(document.getElementById("so-product-search"), "Please select a valid product.");
      soSubmitting = false; if (submitBtn) submitBtn.disabled = false; return;
    }

    // Hard block negative/zero inputs completely bypassing the UI min="1"
    if (isNaN(qty) || qty <= 0) {
      setFieldError(qtyEl, "Enter a valid quantity > 0.");
      soSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const prod = appProducts.find(p => p.id === prodId);
    if (!prod) { showToast('error', 'Error', 'Product not found.'); soSubmitting = false; if (submitBtn) submitBtn.disabled = false; return; }

    // Hard block overdrafts bypassing the visual red border warning
    if (qty > prod.quantity) {
      setFieldError(qtyEl, `Only ${prod.quantity} ${prod.unit} available.`);
      soSubmitting = false; if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // Client-side Low Stock Protection check (server also enforces this, this gives instant feedback)
    if (getLowStockProtectionEnabled()) {
      const threshold = getLowStockThreshold();
      const resultingQty = prod.quantity - qty;
      if (resultingQty <= threshold) {
        showToast('warning', 'Low Stock Protection Active',
          `Cannot deduct ${qty} ${prod.unit} — this would leave only ${resultingQty} unit(s), at or below the protected minimum of ${threshold}. Stock-out blocked to preserve safety stock.`,
          6000
        );
        soSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    }

    // ── Per-product Min Threshold Hard-Block (client-side pre-flight) ─────────
    // Mirrors backend THRESHOLD_INTERCEPT logic for instant UX feedback before API call.
    // Uses the product's own min_threshold + is_enforced flag, falling back to global enforcement.
    const _prodMinThreshold = parseInt(prod.min_threshold, 10) || 0;
    const _globalEnfOn = localStorage.getItem('global_threshold_enforcement') === 'true';
    if ((_globalEnfOn || Boolean(prod.is_enforced)) && _prodMinThreshold > 0) {
      const _projectedStock = prod.quantity - qty;
      if (_projectedStock < _prodMinThreshold) {
        showToast('error', '🚫 Threshold Intercept — Stock-Out Blocked',
          `Cannot deduct ${qty} ${prod.unit} of "${prod.name}": projected stock (${_projectedStock}) would fall below the enforced MIN threshold of ${_prodMinThreshold}. Ask an Admin to adjust the threshold if needed.`,
          8000
        );
        soSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    }

    showStockOutConfirm(prod, qty, async function () {
      const txnId = nextTxnId();
      const txnPayload = { id: txnId, product: prod.name, category: prod.category, type: "Stock Out", quantity: qty, unit: prod.unit, date: getDateStr(), time: getTimeStr(), user: getShortName(), branchId: writeBranchId() };

      try {
        const negativeQty = parseInt("-" + qty, 10);
        const soRes = await fetch(`${API_URL}/inventory/${prodId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityDelta: negativeQty }) });
        if (!soRes.ok) {
          const errData = await soRes.json().catch(() => ({}));

          // ── THRESHOLD GOVERNANCE: Min-Threshold Hard Block ────────────────
          // Server blocked the transaction via THRESHOLD_INTERCEPT — show a clear error.
          if (errData.error === 'THRESHOLD_INTERCEPT') {
            showToast('error', '🚫 Threshold Intercept — Stock-Out Blocked',
              errData.message || `Stock-Out blocked: projected stock would violate the enforced MIN threshold of ${errData.min_threshold ?? '?'}.`,
              8000
            );
            return; // Do NOT proceed with transaction record
          }

          // ── THRESHOLD GOVERNANCE: Critical Low Stock Warning ──────────────
          // The server logged the CRITICAL_LOW_STOCK event; display it here as a banner
          if (errData.error === 'CRITICAL_LOW_STOCK') {
            // Show warning toast but don't block (server allowed the transaction)
            showToast('warning', 'Critical Low Stock Alert',
              `${prod.name} is now below its minimum safety reserve. An alert has been logged for the Admin.`,
              7000
            );
          } else {
            throw errData;
          }
        }
        prod.quantity -= qty;

        await fetch(`${API_URL}/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(txnPayload) });
        appTxns.push(txnPayload);

        // Update activity timeline on dashboard if visible
        updateActivityTimeline();

        const onUndo = async () => {
          try {
            await fetch(`${API_URL}/transactions/${txnId}`, { method: "DELETE" });
            appTxns = appTxns.filter(t => t.id !== txnId);

            // Update activity timeline on dashboard
            updateActivityTimeline();

            await fetch(`${API_URL}/inventory/${prodId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityDelta: qty }) });
            prod.quantity += qty;

            showToast('info', 'Action Undone', `Stock Out of ${qty} ${prod.unit} ${prod.name} reverted.`, 3000);

            const previewEl = document.getElementById("so-preview");
            if (previewEl) previewEl.style.display = "none";
            idEl.value = "";
            unitBox.value = "";
            maxAllowed = 0;

            loadRecentStockOut();
          } catch (err) { showToast('error', 'API Error', 'Undo failed'); }
        };

        showToast('success', 'Stock Out Recorded', `${qty} ${prod.unit} of ${prod.name} deducted.`, 5000, onUndo);
        form.reset();

        const previewEl = document.getElementById("so-preview");
        if (previewEl) previewEl.style.display = "none";
        idEl.value = "";
        unitBox.value = "";
        maxAllowed = 0;

        loadRecentStockOut();
      } catch (err) {
        console.error("Stock Out API Error Response:", err);
        // Handle server-side Low Stock Protection rejection gracefully
        if (err && err.error === 'LOW_STOCK_PROTECTION') {
          showToast('warning', 'Low Stock Protection Active', err.message, 6000);
        } else {
          showToast('error', 'API Error', `Failed: ${err.message || 'Unknown error'}`);
        }
      }
      finally { soSubmitting = false; if (submitBtn) submitBtn.disabled = false; }
    }, function () {
      soSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    });
  });

  document.getElementById("so-clear")?.addEventListener("click", () => {
    clearFormErrors(form);
    form.reset();
    // Bug Fix: also reset hidden fields and internal state that form.reset() doesn't touch
    if (idEl) idEl.value = "";
    if (unitBox) unitBox.value = "";
    maxAllowed = 0;
    if (previewBox) previewBox.style.display = "none";
    if (qtyEl) { qtyEl.style.borderColor = ""; }
    if (qtyErr) { qtyErr.textContent = ""; qtyErr.style.display = "none"; }
  });

  // Clear Display button — persists via localStorage
  document.getElementById("btn-clear-recent-so")?.addEventListener("click", () => {
    const soTxns = getTransactions().filter(t => t.type === "Stock Out");
    const lastId = soTxns.length > 0 ? soTxns[soTxns.length - 1].id : "";
    if (lastId) localStorage.setItem("clearStockOutAfter", lastId);
    const list = document.getElementById("recent-stock-out");
    if (list) list.innerHTML = `<li style="color:var(--slate-400);">No recent stock outs.</li>`;
    showToast('success', 'Display Cleared', 'Recent stock out display has been cleared.');
  });

  loadRecentStockOut();
}

function showStockOutConfirm(prod, qty, onConfirm, onCancel) {
  const modal = document.getElementById("stock-out-confirm");
  if (!modal) { onConfirm(); return; }

  document.getElementById("confirm-product").textContent = prod.name;
  document.getElementById("confirm-qty").textContent = qty + " " + prod.unit;
  document.getElementById("confirm-remaining").textContent = (prod.quantity - qty) + " " + prod.unit;

  modal.style.display = "flex";

  document.getElementById("confirm-yes").onclick = function () {
    modal.style.display = "none";
    onConfirm();
  };
  const cancel = function () {
    modal.style.display = "none";
    if (onCancel) onCancel();
  };
  document.getElementById("confirm-no").onclick = cancel;
  modal.onclick = function (e) {
    if (e.target === modal) cancel();
  };
}

function loadRecentStockOut() {
  const list = document.getElementById("recent-stock-out");
  if (!list) return;
  const clearedAfter = localStorage.getItem("clearStockOutAfter") || "";
  let soTxns = getTransactions().filter(t => t.type === "Stock Out");
  if (clearedAfter) soTxns = soTxns.filter(t => isTxnIdGreaterThan(t.id, clearedAfter));
  const txns = soTxns.slice(-5).reverse();
  list.innerHTML = txns.length === 0
    ? `<li style="color:var(--slate-400);">No recent stock outs.</li>`
    : txns.map(t => `<li><strong>${t.product}</strong><br>Qty: ${t.quantity} ${t.unit}<br>${t.date} — ${t.user}</li>`).join("");
}


// =============================================
//  TRANSACTIONS
// =============================================
let currentTxnPage = 1;

function loadTransactions() {
  const txns = getTransactions();
  const stockIn = txns.filter(t => t.type === "Stock In").length;
  const stockOut = txns.filter(t => t.type === "Stock Out").length;
  setText("txn-stock-in", stockIn);
  setText("txn-stock-out", stockOut);
  setText("txn-net", stockIn - stockOut);

  const products = getProducts();
  const catFilter = document.getElementById("txn-category");
  if (catFilter) {
    const cats = [...new Set(products.map(p => p.category))];
    catFilter.innerHTML = `<option>All Categories</option>` + cats.map(c => `<option>${c}</option>`).join("");
  }

  currentFilteredTxns = txns;
  renderTransactionTable(txns);
}

function renderTransactionTable(txns) {
  const tbody = document.getElementById("txn-body");
  if (!tbody) return;
  if (txns.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px 0;">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--slate-400);">
            <i data-lucide="file-search" class="lucide-icon" style="width: 48px; height: 48px; color: var(--slate-300); margin-bottom: 16px;"></i>
            <h3 style="margin: 0 0 8px 0; color: var(--slate-500); font-weight: 500;">No Transactions Found</h3>
            <p style="margin: 0; font-size: 13px;">Adjust your search or date filters to find specific history logs.</p>
          </div>
        </td>
      </tr>`;
    if (window.lucide) window.lucide.createIcons();
    const info = document.getElementById("txn-page-info");
    if (info) info.textContent = "Page 1 of 1";
    return;
  }

  const reversedTxns = [...txns].reverse();
  const itemsPerPage = 10;
  const totalPages = Math.ceil(reversedTxns.length / itemsPerPage) || 1;
  if (currentTxnPage > totalPages) currentTxnPage = totalPages;
  const startIdx = (currentTxnPage - 1) * itemsPerPage;
  const paginated = reversedTxns.slice(startIdx, startIdx + itemsPerPage);

  tbody.innerHTML = paginated.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.product}</td>
      <td>${categoryBadge(t.category)}</td>
      <td><span class="status ${t.type === 'Stock In' ? 'txn-in' : 'txn-out'}">${t.type}</span></td>
      <td>${t.quantity}</td>
      <td>${t.unit}</td>
      <td>${t.date}</td>
      <td>${t.time}</td>
      <td>${t.user}</td>
    </tr>`).join("");

  const prevBtn = document.getElementById("txn-prev");
  const nextBtn = document.getElementById("txn-next");
  const info = document.getElementById("txn-page-info");
  if (prevBtn && nextBtn && info) {
    info.textContent = `Page ${currentTxnPage} of ${totalPages}`;
    prevBtn.disabled = currentTxnPage === 1;
    nextBtn.disabled = currentTxnPage === totalPages;
    prevBtn.onclick = () => { if (currentTxnPage > 1) { currentTxnPage--; renderTransactionTable(currentFilteredTxns || getTransactions()); } };
    nextBtn.onclick = () => { if (currentTxnPage < totalPages) { currentTxnPage++; renderTransactionTable(currentFilteredTxns || getTransactions()); } };
  }
}

function setupTransactionFilters() {
  const searchInput = document.getElementById("txn-search");
  const catFilter = document.getElementById("txn-category");
  const typeFilter = document.getElementById("txn-type");
  const dateFromInput = document.getElementById("txn-date-from");
  const dateToInput = document.getElementById("txn-date-to");
  const exportBtn = document.getElementById("txn-export");

  function applyFilters() {
    currentTxnPage = 1;
    let txns = getTransactions();
    const q = (searchInput?.value || "").toLowerCase();
    const cat = catFilter?.value || "";
    const type = typeFilter?.value || "";
    const dateFrom = dateFromInput?.value || "";
    const dateTo = dateToInput?.value || "";
    if (q) txns = txns.filter(t => t.product.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    if (cat && cat !== "All Categories") txns = txns.filter(t => t.category === cat);
    if (type && type !== "All Types") txns = txns.filter(t => t.type === type);
    // Date range filter — parse DD/MM/YYYY to comparable YYYY-MM-DD
    if (dateFrom || dateTo) {
      txns = txns.filter(t => {
        const parts = t.date.split("/");
        if (parts.length !== 3) return true;
        const txnISO = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        if (dateFrom && txnISO < dateFrom) return false;
        if (dateTo && txnISO > dateTo) return false;
        return true;
      });
    }
    currentFilteredTxns = txns;
    renderTransactionTable(txns);
  }

  searchInput?.addEventListener("input", applyFilters);
  catFilter?.addEventListener("change", applyFilters);
  typeFilter?.addEventListener("change", applyFilters);
  dateFromInput?.addEventListener("change", applyFilters);
  dateToInput?.addEventListener("change", applyFilters);
  exportBtn?.addEventListener("click", () => {
    exportCSV(currentFilteredTxns || getTransactions(), ["id", "product", "category", "type", "quantity", "unit", "date", "time", "user"], "transactions.csv", "Transactions");
    showToast('success', 'Export Complete', 'Transaction data exported as CSV.');
  });

  // Clear All Transactions button (admin)
  const clearAllBtn = document.getElementById("txn-clear-all");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => clearAllTransactions());
  }
}

// =============================================
//  CLEAR ALL TRANSACTIONS (Admin)
// =============================================
async function clearAllTransactions() {
  showConfirmModal(
    "Delete All Transactions",
    "This will permanently delete ALL transaction records. This action cannot be undone.",
    async () => {
      try {
        const res = await fetch(`${API_URL}/transactions`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
          appTxns = [];
          // Reset all clear-display localStorage cutoffs since DB is empty
          localStorage.removeItem("clearDashRecentAfter");
          localStorage.removeItem("clearStockInAfter");
          localStorage.removeItem("clearStockOutAfter");
          localStorage.removeItem("clearExportLogAfter");
          showToast('success', 'Transactions Cleared', 'All transaction records have been deleted.');
          const page = window.location.pathname.split("/").pop();
          if (page === "transactions.html") loadTransactions();
        } else {
          showToast('error', 'Error', 'Failed to clear transactions.');
        }
      } catch (err) {
        showToast('error', 'API Error', 'Failed to clear transactions.');
      }
    }
  );
}

// =============================================
//  CSV EXPORT ENGINE
// =============================================
function exportCSV(data, fields, filename, exportType) {
  if (!data || data.length === 0) {
    showToast('warning', 'Export Failed', 'No data available to export.');
    return;
  }

  // Generate CSV Header Row
  const csvRows = [];
  csvRows.push(fields.join(","));

  // Generate CSV Data Rows
  data.forEach(row => {
    const values = fields.map(field => {
      let val = row[field];
      if (val === null || val === undefined) val = "";
      // Escape quotes and wrap in quotes if it contains a comma to prevent CSV column breaking
      const strVal = String(val).replace(/"/g, '""');
      return `"${strVal}"`;
    });
    csvRows.push(values.join(","));
  });

  // Construct the Blob and execute the browser download trigger
  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);

  // Log the export action to the backend
  if (exportType) {
    const logPayload = {
      user: getShortName(),
      type: exportType,
      date: getDateStr(),
      time: getTimeStr()
    };
    fetch(`${API_URL}/export-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logPayload)
    }).catch(err => console.error("Failed to log export", err));
  }
}

// =============================================
//  FORM VALIDATION HELPERS
// =============================================
function setFieldError(el, message) {
  const group = el?.closest('.form-group');
  if (!group) return;
  group.classList.add('has-error');
  let errSpan = group.querySelector('.error-msg');
  if (!errSpan) {
    errSpan = document.createElement('span');
    errSpan.className = 'error-msg';
    group.appendChild(errSpan);
  }
  errSpan.textContent = message;
}

function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.form-group.has-error').forEach(g => {
    g.classList.remove('has-error');
  });
}

// =============================================
//  COMMAND PALETTE (Ctrl+P)
// =============================================
function setupCommandPalette() {
  if (document.getElementById("command-palette-backdrop")) return;

  const html = `
    <div id="command-palette-backdrop">
      <div id="command-palette">
        <div class="cmd-header">
          <i data-lucide="search" class="lucide-icon" style="color:var(--slate-400);"></i>
          <input type="text" class="cmd-input" id="cmd-input" placeholder="Type a command or search..." autocomplete="off">
        </div>
        <div class="cmd-body" id="cmd-results"></div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) window.lucide.createIcons();

  const backdrop = document.getElementById("command-palette-backdrop");
  const input = document.getElementById("cmd-input");
  const resultsBox = document.getElementById("cmd-results");

  const commands = [
    { label: "Go to Dashboard", icon: "layout-dashboard", action: () => window.location.href = "dashboard.html" },
    { label: "Go to Inventory", icon: "package", action: () => window.location.href = "inventory.html" },
    { label: "Stock In Items", icon: "package-plus", action: () => window.location.href = "stock-in.html" },
    { label: "Stock Out Items", icon: "package-minus", action: () => window.location.href = "stock-out.html" },
    { label: "Go to Transactions", icon: "clipboard-list", action: () => window.location.href = "transactions.html" },
    { label: "Stock Threshold Governance", icon: "sliders", action: () => window.location.href = "threshold.html" },
    { label: "User Management (Admin)", icon: "users", action: () => window.location.href = "users.html", adminOnly: true },
    { label: "Log Out", icon: "log-out", action: () => { if (typeof confirmLogout === 'function') confirmLogout(); else window.location.href = 'index.html'; } }
  ];

  let selectedIndex = 0;
  let currentMatches = [];

  function renderResults(query = "") {
    const userRole = localStorage.getItem("userRole");
    currentMatches = commands.filter(c => {
      if (c.adminOnly && userRole !== "admin") return false;
      return c.label.toLowerCase().includes(query.toLowerCase());
    });

    if (currentMatches.length === 0) {
      resultsBox.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--slate-400); font-size: 14px;">No commands found for "${query}"</div>`;
      return;
    }

    resultsBox.innerHTML = currentMatches.map((c, i) => `
      <div class="cmd-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
        <i data-lucide="${c.icon}" class="lucide-icon"></i>
        <span>${c.label}</span>
        <span class="cmd-shortcut">⏎</span>
      </div>
    `).join("");

    if (window.lucide) window.lucide.createIcons();

    resultsBox.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener("mouseenter", () => {
        selectedIndex = parseInt(el.getAttribute('data-index'));
        updateSelection();
      });
      el.addEventListener("click", () => {
        closePalette();
        currentMatches[selectedIndex].action();
      });
    });
  }

  function updateSelection() {
    const items = resultsBox.querySelectorAll('.cmd-item');
    items.forEach(el => el.classList.remove('selected'));
    if (items[selectedIndex]) {
      items[selectedIndex].classList.add('selected');
      items[selectedIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function openPalette() {
    // Disable if on the login page
    const page = window.location.pathname.split("/").pop();
    if (page === "index.html" || page === "") return;

    backdrop.classList.add('active');
    input.value = "";
    selectedIndex = 0;
    renderResults();
    setTimeout(() => input.focus(), 50);
  }

  function closePalette() {
    backdrop.classList.remove('active');
    input.blur();
  }

  // Global Keyboard Listener
  document.addEventListener("keydown", (e) => {
    // Ctrl+P or Cmd+P
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (backdrop.classList.contains('active')) closePalette();
      else openPalette();
    }
    // Esc to close
    if (e.key === "Escape" && backdrop.classList.contains('active')) {
      closePalette();
    }
  });

  // Input navigation
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (selectedIndex < currentMatches.length - 1) {
        selectedIndex++;
        updateSelection();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (selectedIndex > 0) {
        selectedIndex--;
        updateSelection();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentMatches[selectedIndex]) {
        closePalette();
        currentMatches[selectedIndex].action();
      }
    }
  });

  input.addEventListener("input", (e) => {
    selectedIndex = 0;
    renderResults(e.target.value);
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) closePalette();
  });
}

// =============================================
//  KEYBOARD SHORTCUT (Ctrl+K)
// =============================================
function setupSearchShortcut() {
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      const searchInput = document.querySelector('.search-wrapper input:not([disabled])')
        || document.getElementById('inv-search')
        || document.getElementById('txn-search')
        || document.getElementById('user-search');
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    }
  });
}

// =============================================
//  DARK MODE TOGGLE
// =============================================
function initTheme() {
  const isDark = localStorage.getItem("bhandolTheme") === "dark";
  if (isDark) document.body.classList.add("dark-mode");

  const toggleBtn = document.getElementById("theme-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const mode = document.body.classList.contains("dark-mode") ? "dark" : "light";
      localStorage.setItem("bhandolTheme", mode);

      // Dynamically push the new contrast border color to the dashboard pie chart if it exists
      if (window.dashboardPieChart) {
        const isDark = mode === "dark";
        const newColor = isDark
          ? getComputedStyle(document.body).getPropertyValue('--slate-800').trim()
          : getComputedStyle(document.body).getPropertyValue('--navy-800').trim();
        window.dashboardPieChart.data.datasets[0].borderColor = newColor;
        // Update legend label color for dark mode legibility
        window.dashboardPieChart.options.plugins.legend.labels.color = isDark ? '#c8d6e5' : '#64748b';
        window.dashboardPieChart.update();
      }
      // Dynamically update bar chart axis/legend colors for dark mode
      if (window.dashboardBarChart) {
        const isDark = mode === "dark";
        const newTextColor = isDark ? '#c8d6e5' : '#64748b';
        const chart = window.dashboardBarChart;
        if (chart.options.scales && chart.options.scales.x && chart.options.scales.x.ticks)
          chart.options.scales.x.ticks.color = newTextColor;
        if (chart.options.scales && chart.options.scales.y && chart.options.scales.y.ticks)
          chart.options.scales.y.ticks.color = newTextColor;
        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels)
          chart.options.plugins.legend.labels.color = newTextColor;
        chart.update();
      }
    });
  }

}

// =============================================
//  TRANSACTION STAT CARD MODALS
// =============================================

let _txnNetChartInstance = null;

// Read the active date pickers from the transactions page filter bar
function getActiveTxnDateFilter() {
  return {
    dateFrom: document.getElementById('txn-date-from')?.value || '',
    dateTo: document.getElementById('txn-date-to')?.value || ''
  };
}

// Reuse same DD/MM/YYYY → YYYY-MM-DD parsing already in applyFilters
function _filterTxnsByDate(txns, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return txns;
  return txns.filter(t => {
    const parts = t.date.split('/');
    if (parts.length !== 3) return true;
    const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  });
}

// --- Shared inner HTML builders ---

function _buildHighlightWidget(title, icon, items, accentCss) {
  if (items.length === 0) {
    return `<div style="color:var(--slate-400);font-size:13px;padding:12px 0;">No data available for the selected period.</div>`;
  }
  const maxVal = items[0].value;
  return `
    <div style="background:var(--surface-strong);border-radius:var(--radius-md);padding:20px;border:1px solid var(--surface-border);flex-shrink:0;">
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--slate-500);margin-bottom:18px;display:flex;align-items:center;gap:8px;">
        <i data-lucide="${icon}" class="lucide-icon" style="width:14px;height:14px;"></i>${title}
      </h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${items.map((item, i) => `
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:11px;font-weight:700;color:var(--slate-400);width:18px;text-align:center;flex-shrink:0;">${i + 1}</span>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;gap:8px;">
                <span style="font-size:13px;font-weight:600;color:var(--slate-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</span>
                <span style="font-size:12px;font-weight:700;flex-shrink:0;${accentCss}">${item.value.toLocaleString()} units</span>
              </div>
              <div style="height:5px;background:var(--surface-border-strong);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0}%;${accentCss.includes('green') ? 'background:var(--green-500)' : 'background:var(--red-500)'};border-radius:3px;"></div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function _buildReportTable(headers, rows, emptyMsg) {
  if (rows.length === 0) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 0;color:var(--slate-400);">
        <i data-lucide="file-search" class="lucide-icon" style="width:44px;height:44px;color:var(--slate-300);margin-bottom:14px;"></i>
        <h3 style="margin:0 0 6px;color:var(--slate-500);font-weight:500;">${emptyMsg}</h3>
        <p style="margin:0;font-size:13px;">Adjust the date filter or check back when records are available.</p>
      </div>`;
  }
  return `
    <div style="overflow:auto;border-radius:var(--radius-md);border:1px solid var(--surface-border);">
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <thead style="background:var(--surface-alt);position:sticky;top:0;z-index:5;border-bottom:1px solid var(--surface-border);">
          <tr>${headers.map(h => `<th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate-500);white-space:nowrap;">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((cells, ri) => `
            <tr style="border-bottom:1px solid var(--surface-border);${ri % 2 === 1 ? 'background:var(--surface-strong);' : ''}">
              ${cells.map(c => `<td style="padding:9px 16px;font-size:13px;">${c}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- Individual report renderers ---

function _renderStockInReport(txns, bodyEl) {
  // Top 5 by total quantity stocked in
  const totals = {};
  txns.forEach(t => { totals[t.product] = (totals[t.product] || 0) + t.quantity; });
  const top5 = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const highlightHtml = _buildHighlightWidget(
    'Most Frequently Stocked Items — Top 5 by Volume',
    'trending-up', top5,
    'color:var(--green-600);'
  );

  const tableRows = [...txns].reverse().map(t => [
    t.date, t.time,
    `<strong style="color:var(--slate-700);">${t.product}</strong>`,
    categoryBadge(t.category),
    `<span style="font-weight:700;color:var(--green-600);">+${Math.abs(t.quantity).toLocaleString()}</span>`,
    t.unit,
    t.user
  ]);

  bodyEl.innerHTML = `
    ${highlightHtml}
    <div>
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--slate-500);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <i data-lucide="list" class="lucide-icon" style="width:14px;height:14px;"></i>
        Full Stock In Log &mdash; ${txns.length} record${txns.length !== 1 ? 's' : ''}
      </h3>
      ${_buildReportTable(
        ['Date', 'Time', 'Product', 'Category', 'Qty Added', 'Unit', 'User'],
        tableRows,
        'No Stock In data recorded for this period'
      )}
    </div>`;
}

function _renderStockOutReport(txns, bodyEl) {
  const totals = {};
  txns.forEach(t => { totals[t.product] = (totals[t.product] || 0) + Math.abs(t.quantity); });
  const top5 = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const highlightHtml = _buildHighlightWidget(
    'Top Deficit — Most Stocked Out Items',
    'trending-down', top5,
    'color:var(--red-600);'
  );

  const tableRows = [...txns].reverse().map(t => [
    t.date, t.time,
    `<strong style="color:var(--slate-700);">${t.product}</strong>`,
    categoryBadge(t.category),
    // Always show absolute positive quantity for readability
    `<span style="font-weight:700;color:var(--red-600);">${Math.abs(t.quantity).toLocaleString()}</span>`,
    t.unit,
    t.user
  ]);

  bodyEl.innerHTML = `
    ${highlightHtml}
    <div>
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--slate-500);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <i data-lucide="list" class="lucide-icon" style="width:14px;height:14px;"></i>
        Full Stock Out Log &mdash; ${txns.length} record${txns.length !== 1 ? 's' : ''}
      </h3>
      ${_buildReportTable(
        ['Date', 'Time', 'Product', 'Category', 'Qty Deducted', 'Unit', 'User'],
        tableRows,
        'No Stock Out data recorded for this period'
      )}
    </div>`;
}

function _renderNetMovementReport(txns, bodyEl) {
  const isDark = document.body.classList.contains('dark-mode');
  const textColor = isDark ? '#c8d6e5' : '#64748b';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  // Aggregate per category
  const cats = {};
  txns.forEach(t => {
    if (!cats[t.category]) cats[t.category] = { in: 0, out: 0 };
    if (t.type === 'Stock In') cats[t.category].in += t.quantity;
    else cats[t.category].out += Math.abs(t.quantity);
  });

  const labels = Object.keys(cats);
  const inData = labels.map(c => cats[c].in);
  const outData = labels.map(c => cats[c].out);
  const netData = labels.map(c => cats[c].in - cats[c].out);

  const totalIn = inData.reduce((a, b) => a + b, 0);
  const totalOut = outData.reduce((a, b) => a + b, 0);
  const totalNet = totalIn - totalOut;

  // Top-level summary KPI strip
  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;flex-shrink:0;">
      <div style="background:var(--surface-strong);border-radius:var(--radius-md);padding:16px 20px;border:1px solid var(--surface-border);text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate-500);margin-bottom:6px;">Total Stock In</div>
        <div style="font-size:30px;font-weight:700;color:var(--green-600);">+${totalIn.toLocaleString()}</div>
      </div>
      <div style="background:var(--surface-strong);border-radius:var(--radius-md);padding:16px 20px;border:1px solid var(--surface-border);text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate-500);margin-bottom:6px;">Total Stock Out</div>
        <div style="font-size:30px;font-weight:700;color:var(--red-600);">${totalOut.toLocaleString()}</div>
      </div>
      <div style="background:var(--surface-strong);border-radius:var(--radius-md);padding:16px 20px;border:1px solid var(--surface-border);text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate-500);margin-bottom:6px;">Net Movement</div>
        <div style="font-size:30px;font-weight:700;${totalNet >= 0 ? 'color:var(--green-600)' : 'color:var(--red-600)'};">${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()}</div>
      </div>
    </div>`;

  if (labels.length === 0) {
    bodyEl.innerHTML = summaryHtml + `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 0;color:var(--slate-400);">
        <i data-lucide="bar-chart-2" class="lucide-icon" style="width:44px;height:44px;color:var(--slate-300);margin-bottom:14px;"></i>
        <h3 style="margin:0 0 6px;color:var(--slate-500);font-weight:500;">No movement data for this period</h3>
        <p style="margin:0;font-size:13px;">Adjust the date filter or add transactions to see analysis.</p>
      </div>`;
    return;
  }

  // Per-category breakdown table rows
  const tableRows = labels.map(cat => {
    const d = cats[cat];
    const net = d.in - d.out;
    return [
      categoryBadge(cat),
      `<span style="font-weight:600;color:var(--green-600);">+${d.in.toLocaleString()}</span>`,
      `<span style="font-weight:600;color:var(--red-600);">${d.out.toLocaleString()}</span>`,
      `<span style="font-weight:700;${net >= 0 ? 'color:var(--green-600)' : 'color:var(--red-600)'};">${net >= 0 ? '+' : ''}${net.toLocaleString()}</span>`
    ];
  });

  bodyEl.innerHTML = `
    ${summaryHtml}
    <div style="background:var(--surface-strong);border-radius:var(--radius-md);padding:20px;border:1px solid var(--surface-border);flex-shrink:0;">
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--slate-500);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <i data-lucide="bar-chart-3" class="lucide-icon" style="width:14px;height:14px;"></i>Category Flow Breakdown
      </h3>
      <div style="position:relative;height:280px;">
        <canvas id="txn-net-chart"></canvas>
      </div>
    </div>
    <div>
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--slate-500);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <i data-lucide="table-2" class="lucide-icon" style="width:14px;height:14px;"></i>Net Movement by Category
      </h3>
      ${_buildReportTable(
        ['Category', 'Total In', 'Total Out', 'Net Movement'],
        tableRows,
        'No category data available'
      )}
    </div>`;

  // Render chart after DOM paints
  requestAnimationFrame(() => {
    const canvas = document.getElementById('txn-net-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_txnNetChartInstance) { _txnNetChartInstance.destroy(); _txnNetChartInstance = null; }

    _txnNetChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Stock In',
            data: inData,
            backgroundColor: 'rgba(34,197,94,0.75)',
            borderRadius: 5,
            maxBarThickness: 32
          },
          {
            label: 'Stock Out',
            data: outData,
            backgroundColor: 'rgba(239,68,68,0.75)',
            borderRadius: 5,
            maxBarThickness: 32
          },
          {
            label: 'Net',
            data: netData,
            // Positive net → blue accent; negative → red tint
            backgroundColor: netData.map(v => v >= 0 ? 'rgba(59,130,246,0.75)' : 'rgba(239,68,68,0.4)'),
            borderRadius: 5,
            maxBarThickness: 32
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: 'Inter', size: 12 },
              padding: 16,
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)',
            titleFont: { family: 'Inter', size: 13, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 12, cornerRadius: 8,
            borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
            grid: { color: gridColor, borderDash: [5, 5] },
            border: { display: false }
          }
        }
      }
    });
  });
}

// --- Public API ---

window.openTxnReportModal = function (type) {
  const modal = document.getElementById('txn-report-modal');
  const titleEl = document.getElementById('txn-report-title');
  const bodyEl = document.getElementById('txn-report-body');
  if (!modal || !titleEl || !bodyEl) return;

  // Tear down any stale chart before rebuilding
  if (_txnNetChartInstance) { _txnNetChartInstance.destroy(); _txnNetChartInstance = null; }
  bodyEl.innerHTML = '';

  // Grab the active date filter from the page
  const { dateFrom, dateTo } = getActiveTxnDateFilter();
  // Use already-filtered set so category/search/type dropdowns are also respected
  const baseTxns = currentFilteredTxns || getTransactions();
  const dateTxns = _filterTxnsByDate(baseTxns, dateFrom, dateTo);

  if (type === 'in') {
    const txns = dateTxns.filter(t => t.type === 'Stock In');
    titleEl.innerHTML = `<i data-lucide="arrow-down-to-line" class="lucide-icon" style="width:20px;height:20px;color:var(--green-600);flex-shrink:0;"></i> Stock In Report`;
    _renderStockInReport(txns, bodyEl);
  } else if (type === 'out') {
    const txns = dateTxns.filter(t => t.type === 'Stock Out');
    titleEl.innerHTML = `<i data-lucide="arrow-up-from-line" class="lucide-icon" style="width:20px;height:20px;color:var(--red-600);flex-shrink:0;"></i> Stock Out Report`;
    _renderStockOutReport(txns, bodyEl);
  } else if (type === 'net') {
    titleEl.innerHTML = `<i data-lucide="bar-chart-3" class="lucide-icon" style="width:20px;height:20px;color:var(--blue-600);flex-shrink:0;"></i> Inventory Flow & Trend Analysis`;
    _renderNetMovementReport(dateTxns, bodyEl);
  }

  modal.style.display = 'flex';
  if (window.lucide) window.lucide.createIcons({ nodes: [modal] });
  // Close on backdrop click
  modal.onclick = (e) => { if (e.target === modal) window.closeTxnReportModal(); };
};

window.closeTxnReportModal = function () {
  const modal = document.getElementById('txn-report-modal');
  if (modal) modal.style.display = 'none';
  if (_txnNetChartInstance) { _txnNetChartInstance.destroy(); _txnNetChartInstance = null; }
};

// =============================================
//  ANIMATED STAT COUNTERS
// =============================================
function animateStatCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const raw = el.textContent.replace(/,/g, '');
    const target = parseInt(raw, 10);
    if (isNaN(target) || target === 0 || el.hasAttribute('data-counted')) return;

    el.setAttribute('data-counted', 'true');
    const duration = 800; // ms
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

// =============================================
//  RESPONSIVE SIDEBAR TOGGLE
// =============================================
function setupResponsiveSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Create toggle button if not exists
  if (!document.querySelector('.sidebar-toggle')) {
    const toggle = document.createElement('button');
    toggle.className = 'sidebar-toggle';
    toggle.innerHTML = '☰';
    toggle.setAttribute('aria-label', 'Toggle sidebar');
    document.body.prepend(toggle);

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.prepend(overlay);

    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
      toggle.innerHTML = sidebar.classList.contains('open') ? '✕' : '☰';
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
      toggle.innerHTML = '☰';
    });

    // Close sidebar when a nav link is clicked (mobile)
    sidebar.querySelectorAll('nav a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          overlay.classList.remove('active');
          toggle.innerHTML = '☰';
        }
      });
    });
  }
}

// =============================================
//  WIDGET FULLSCREEN MODAL (Phase 10)
// =============================================
let currentFullscreenWidgetId = null;
let fullscreenChartInstance = null;

window.openWidgetFullscreen = function (cardId) {
  const modal = document.getElementById('widget-fullscreen-modal');
  const titleEl = document.getElementById('wf-title');
  const bodyEl = document.getElementById('wf-body');
  const sourceCard = document.getElementById(cardId);
  if (!modal || !sourceCard || !bodyEl) return;

  // Extract Title and Icon from the source card
  const titleNode = sourceCard.querySelector('h2, h3');
  if (titleNode) {
    titleEl.innerHTML = titleNode.innerHTML;
  } else {
    titleEl.textContent = "Expanded View";
  }

  // Clear previous body
  bodyEl.innerHTML = '';
  if (fullscreenChartInstance) {
    fullscreenChartInstance.destroy();
    fullscreenChartInstance = null;
  }

  // Handle Chart.js instances
  const canvas = sourceCard.querySelector('canvas');
  if (canvas) {
    // Clone canvas architecture but build a fresh chart onto it
    const newCanvas = document.createElement('canvas');
    bodyEl.appendChild(newCanvas);

    // Attempt to extract the original Chart instance based on the canvas ID
    let originalChart = null;
    if (canvas.id === 'stockMovementChart' && window.dashboardBarChart) originalChart = window.dashboardBarChart;
    if (canvas.id === 'categoryPieChart' && window.dashboardPieChart) originalChart = window.dashboardPieChart;

    if (originalChart) {
      let newData = JSON.parse(JSON.stringify(originalChart.config.data)); // Deep clone data structure

      // Re-inject complex color objects that JSON.stringify strips
      if (canvas.id === 'stockMovementChart') {
        const createGradient = (ctx, colorStart, colorEnd) => {
          const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 800);
          gradient.addColorStop(0, colorStart);
          gradient.addColorStop(1, colorEnd);
          return gradient;
        };
        newData.datasets[0].backgroundColor = createGradient(newCanvas, 'rgba(34,197,94,0.9)', 'rgba(34,197,94,0.3)');
        newData.datasets[1].backgroundColor = createGradient(newCanvas, 'rgba(239,68,68,0.9)', 'rgba(239,68,68,0.3)');
      } else if (canvas.id === 'categoryPieChart') {
        newData.datasets[0].backgroundColor = [...originalChart.config.data.datasets[0].backgroundColor];
        newData.datasets[0].borderColor = originalChart.config.data.datasets[0].borderColor;
      }

      // Re-initialize a new Chart instance using the original configuration options
      const isDark = document.body.classList.contains('dark-mode');
      const textColor = isDark ? '#c8d6e5' : '#64748b'; // slate-700 dark / slate-500 light

      let newOptions = Object.assign({}, originalChart.config.options, {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 } // instant load
      });

      // Override colors for dark mode legibility
      if (newOptions.plugins && newOptions.plugins.legend && newOptions.plugins.legend.labels) {
        newOptions.plugins.legend.labels.color = textColor;
      }
      if (newOptions.scales) {
        if (newOptions.scales.x && newOptions.scales.x.ticks) newOptions.scales.x.ticks.color = textColor;
        if (newOptions.scales.y && newOptions.scales.y.ticks) newOptions.scales.y.ticks.color = textColor;
      }

      fullscreenChartInstance = new Chart(newCanvas, {
        type: originalChart.config.type,
        data: newData,
        options: newOptions
      });
    }
  }
  // Handle standard DOM blocks (like Heatmap or Stat Cards)
  else {
    const cloneableContent = sourceCard.querySelector('.heatmap-container');
    if (cloneableContent) {
      bodyEl.appendChild(cloneableContent.cloneNode(true));
      if (window.lucide) window.lucide.createIcons({ root: bodyEl });
    } else if (sourceCard.classList.contains('stat-card')) {
      const clonedCard = document.createElement('div');
      clonedCard.innerHTML = sourceCard.innerHTML;
      clonedCard.className = sourceCard.className;
      clonedCard.classList.remove('clickable');

      // Strip out the maximize button
      const mxBtn = clonedCard.querySelector('.maximize-btn');
      if (mxBtn) mxBtn.remove();

      // Scale up for focus mode
      clonedCard.style.display = "flex";
      clonedCard.style.flexDirection = "column";
      clonedCard.style.alignItems = "center";
      clonedCard.style.justifyContent = "center";
      clonedCard.style.border = "none";
      clonedCard.style.background = "transparent";
      clonedCard.style.boxShadow = "none";
      clonedCard.style.height = "100%";
      clonedCard.style.width = "100%";

      const icon = clonedCard.querySelector('.stat-icon');
      if (icon) {
        icon.style.width = "96px";
        icon.style.height = "96px";
        icon.style.marginBottom = "32px";
        icon.style.display = "flex";
        icon.style.alignItems = "center";
        icon.style.justifyContent = "center";
        const svg = icon.querySelector('svg, i');
        if (svg) { svg.style.width = "48px"; svg.style.height = "48px"; }
      }

      const h3 = clonedCard.querySelector('h3');
      if (h3) {
        h3.style.fontSize = "28px";
        h3.style.marginBottom = "24px";
      }

      const num = clonedCard.querySelector('.stat-number');
      if (num) {
        num.style.fontSize = "130px";
      }

      bodyEl.appendChild(clonedCard);
      if (window.lucide) window.lucide.createIcons({ root: bodyEl });
    }
  }

  modal.style.display = 'flex';
  currentFullscreenWidgetId = cardId;

  // Close on Escape or Outside Click
  const closeHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  const clickHandler = (e) => {
    if (e.target === modal) closeModal();
  };

  const closeModal = () => {
    document.removeEventListener('keydown', closeHandler);
    modal.removeEventListener('mousedown', clickHandler);
    closeWidgetFullscreen();
  };

  document.addEventListener('keydown', closeHandler);
  modal.addEventListener('mousedown', clickHandler);
};

// =============================================
//  THRESHOLD GOVERNANCE MODULE
// =============================================

// ── State ────────────────────────────────────────────────────────────────────
let thresholdProducts = []; // all products with threshold fields
let thresholdRequests = []; // all requests (filtered by role)
let govCurrentPage   = 1;
const GOV_PAGE_SIZE  = 10;

// Normalize product threshold properties with sensible defaults
function normalizeProductThreshold(p) {
  const minVal = (p.min_threshold !== undefined && p.min_threshold !== null) ? p.min_threshold
               : (p.min_stock !== undefined && p.min_stock !== null) ? p.min_stock
               : (p.minStock !== undefined && p.minStock !== null) ? p.minStock
               : (p.minThreshold !== undefined && p.minThreshold !== null) ? p.minThreshold
               : 0;

  const maxVal = (p.max_threshold !== undefined && p.max_threshold !== null) ? p.max_threshold
               : (p.max_stock !== undefined && p.max_stock !== null) ? p.max_stock
               : (p.maxStock !== undefined && p.maxStock !== null) ? p.maxStock
               : (p.maxThreshold !== undefined && p.maxThreshold !== null) ? p.maxThreshold
               : 0;

  const isEnforced = (p.is_enforced !== undefined && p.is_enforced !== null) ? Boolean(p.is_enforced)
                   : (p.isEnforced !== undefined && p.isEnforced !== null) ? Boolean(p.isEnforced)
                   : (p.enforced !== undefined && p.enforced !== null) ? Boolean(p.enforced)
                   : false;

  const minNum = parseInt(minVal, 10);
  const maxNum = parseInt(maxVal, 10);

  return {
    ...p,
    id: p.id || p._id || `PROD_${Math.random().toString(36).substr(2, 9)}`,
    name: p.name || 'Unnamed Product',
    category: p.category || 'General',
    unit: p.unit || 'pcs',
    quantity: parseInt(p.quantity, 10) || 0,
    branchId: p.branchId || p.branch_id || p.branch || '',
    min_threshold: isNaN(minNum) ? 0 : Math.max(0, minNum),
    max_threshold: isNaN(maxNum) ? 0 : Math.max(0, maxNum),
    is_enforced: isEnforced
  };
}

// Update UI elements representing global enforcement toggle state
function applyGlobalToggleUI(isOn) {
  // Update all enforcement badges on the page
  ['global-status-badge', 'emp-global-status-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.className = `enforcement-status-badge ${isOn ? 'on' : 'off'}`;
    badge.innerHTML = isOn
      ? `<i data-lucide="shield-check" class="lucide-icon" style="width:10px;height:10px;"></i> Active`
      : `<i data-lucide="x-circle" class="lucide-icon" style="width:10px;height:10px;"></i> Inactive`;
  });

  // Update master card border
  const masterCard = document.getElementById('master-switch-card');
  if (masterCard) {
    masterCard.classList.toggle('enforcement-on',  isOn);
    masterCard.classList.toggle('enforcement-off', !isOn);
  }

  // Sync the toggle input state
  const toggle = document.getElementById('toggle-global-enforcement');
  if (toggle) toggle.checked = isOn;

  // Employee read-only description
  const empDesc = document.getElementById('emp-enforcement-desc');
  if (empDesc) {
    empDesc.textContent = isOn
      ? 'Enforcement is ACTIVE. Stock-In transactions that exceed product max thresholds will be blocked. Submit a Limit Expansion Request if you need higher capacity.'
      : 'Enforcement is currently INACTIVE. Threshold limits are in monitoring mode only — transactions proceed normally.';
  }

  if (window.lucide) window.lucide.createIcons();
}

function setupThreshold() {
  const role = getUserRole();
  // Panels are shown/hidden via CSS (is-admin class on body), but we also
  // explicitly show the right one so JS logic can run safely.
  const adminPanel = document.getElementById('admin-threshold-panel');
  const empPanel   = document.getElementById('employee-threshold-panel');

  if (role === 'admin') {
    if (adminPanel)  adminPanel.style.display  = 'block';
    if (empPanel)    empPanel.style.display     = 'none';
    setupThresholdAdmin();
  } else {
    if (adminPanel)  adminPanel.style.display  = 'none';
    if (empPanel)    empPanel.style.display     = 'block';
    setupThresholdEmployee();
  }

  // Both roles see the enforcement status badge
  loadThresholdSettings();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED: Load global enforcement state
// ─────────────────────────────────────────────────────────────────────────────
async function loadThresholdSettings() {
  // First, check localStorage for immediate zero-latency render
  const localVal = localStorage.getItem('global_threshold_enforcement');
  if (localVal !== null) {
    applyGlobalToggleUI(localVal === 'true');
  }

  try {
    const token = getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let isOn = false;
    let fetched = false;

    // Fetch global settings
    const res = await fetch(`${API_URL}/settings`, { headers }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data && typeof data === 'object' && ('global_threshold_enforcement' in data)) {
        const val = data.global_threshold_enforcement;
        isOn = val === true || val === 'true' || val === 1 || val === '1';
        fetched = true;
      }
    }

    if (!fetched) {
      const fRes = await fetch(`${API_URL}/threshold/settings`, { headers }).catch(() => null);
      if (fRes && fRes.ok) {
        const fData = await fRes.json().catch(() => ({}));
        const val = fData.global_threshold_enforcement;
        isOn = val === true || val === 'true' || val === 1 || val === '1';
        fetched = true;
      }
    }

    if (fetched) {
      localStorage.setItem('global_threshold_enforcement', String(isOn));
      applyGlobalToggleUI(isOn);
    } else if (localVal !== null) {
      applyGlobalToggleUI(localVal === 'true');
    }
  } catch (err) {
    console.warn('[Threshold] Could not load settings:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Setup
// ─────────────────────────────────────────────────────────────────────────────
async function setupThresholdAdmin() {
  // Wire global enforcement toggle
  const toggle = document.getElementById('toggle-global-enforcement');
  if (toggle) {
    const saved = localStorage.getItem('global_threshold_enforcement');
    if (saved !== null) {
      toggle.checked = saved === 'true';
    }

    toggle.addEventListener('change', async () => {
      const newVal = toggle.checked;
      // Immediately write localStorage & update UI for zero-latency
      localStorage.setItem('global_threshold_enforcement', String(newVal));
      applyGlobalToggleUI(newVal);

      try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_URL}/settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ key: 'global_threshold_enforcement', value: String(newVal) })
        });
        showToast(
          newVal ? 'success' : 'warning',
          `Global Enforcement ${newVal ? 'Activated' : 'Deactivated'}`,
          newVal
            ? 'Threshold enforcement is now ACTIVE across all enforced products.'
            : 'Threshold enforcement is now INACTIVE. All transactions proceed in soft-monitoring mode.'
        );
      } catch (err) {
        console.error('[Threshold] Error saving global enforcement setting:', err);
        showToast('error', 'Save Failed', 'Could not update global enforcement setting on server.');
      }
    });
  }

  // Populate branch filter with "All Branches" as default selection
  populateBranchFilter();

  // Seed threshold products immediately from appProducts if available
  if (thresholdProducts.length === 0 && Array.isArray(appProducts) && appProducts.length > 0) {
    thresholdProducts = appProducts.map(normalizeProductThreshold);
    populateBranchFilter();
    renderGovernanceTable();
  }

  // Load pending requests
  await loadPendingRequests();

  // Load products governance table using exact same inventory endpoint as inventory.html
  await loadGovernanceProducts();

  // Load audit log
  await loadAuditLog();

  // Wire search + branch filter
  document.getElementById('thresh-product-search')?.addEventListener('input', () => {
    govCurrentPage = 1;
    renderGovernanceTable();
  });
  document.getElementById('thresh-branch-filter')?.addEventListener('change', () => {
    govCurrentPage = 1;
    renderGovernanceTable();
  });

  // Wire reject reason modal
  const rejectModal = document.getElementById('reject-reason-modal');
  if (rejectModal) {
    document.getElementById('reject-reason-cancel').onclick = () => rejectModal.style.display = 'none';
    rejectModal.onclick = (e) => { if (e.target === rejectModal) rejectModal.style.display = 'none'; };
  }
}

// Dynamically populate the branch filter dropdown with "All Branches" as the default selection
function populateBranchFilter() {
  const branchSel = document.getElementById('thresh-branch-filter');
  if (!branchSel) return;
  const currentVal = branchSel.value || 'all';

  const branchMap = new Map();
  // Register known branches from appBranches
  (appBranches || []).forEach(b => {
    if (b && b.id) branchMap.set(String(b.id), b.name || b.id);
  });
  // Discover any branches directly present on loaded products
  (thresholdProducts || []).forEach(p => {
    const bId = p.branchId || p.branch_id || p.branch;
    if (bId && !branchMap.has(String(bId))) {
      branchMap.set(String(bId), branchName(bId) || String(bId));
    }
  });

  let optionsHtml = '<option value="all" selected>All Branches</option>';
  branchMap.forEach((name, id) => {
    optionsHtml += `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
  });
  branchSel.innerHTML = optionsHtml;
  branchSel.value = currentVal;
  if (!branchSel.value) branchSel.value = 'all';
}

// Load all expansion requests (admin sees all statuses for pending tab; all combined)
async function loadPendingRequests() {
  const tbody = document.getElementById('pending-requests-body');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_URL}/threshold/requests`);
    const all = res.ok ? await res.json() : [];
    thresholdRequests = all;

    const pending = all.filter(r => r.status === 'PENDING');

    // Update pending count badge
    const badge = document.getElementById('pending-count-badge');
    if (badge) {
      badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
      badge.textContent   = `${pending.length} pending`;
      badge.className     = `enforcement-status-badge ${pending.length > 0 ? 'off' : 'on'}`;
    }

    if (pending.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="thr-empty-state"><i data-lucide="inbox" class="lucide-icon"></i><div>No pending requests. All expansion requests are up to date.</div></div></td></tr>`;
      if (window.lucide) window.lucide.createIcons({ root: tbody });
      return;
    }

    tbody.innerHTML = pending.map(r => `
      <tr data-reqid="${r.id}">
        <td><code style="font-size:12px;">${escapeHtml(r.id)}</code></td>
        <td>${escapeHtml(branchName(r.branchId))}</td>
        <td><strong>${escapeHtml(r.productName)}</strong></td>
        <td>${r.currentMax > 0 ? r.currentMax : '<span style="color:var(--slate-400);">Not set</span>'}</td>
        <td><strong style="color:var(--blue-600);">${r.requestedMax}</strong></td>
        <td style="max-width:180px;white-space:normal;font-size:12.5px;color:var(--slate-600);">${escapeHtml(r.reason || '—')}</td>
        <td style="white-space:nowrap;font-size:12px;color:var(--slate-500);">${r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="approve-btn" onclick="approveRequest('${r.id}')">
            <i data-lucide="check" class="lucide-icon" style="width:12px;height:12px;"></i> Approve
          </button>
          <button class="reject-btn" onclick="openRejectModal('${r.id}')">
            <i data-lucide="x" class="lucide-icon" style="width:12px;height:12px;"></i> Reject
          </button>
        </td>
      </tr>
    `).join('');
    if (window.lucide) window.lucide.createIcons({ root: tbody });
  } catch (err) {
    console.error('[Threshold] Failed to load requests:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red-600);padding:20px;">Failed to load requests.</td></tr>`;
  }
}

// Approve a pending request
window.approveRequest = async function (reqId) {
  showConfirmModal(
    'Approve Expansion Request',
    `Approve request ${reqId}? This will immediately update the product's max threshold.`,
    async () => {
      try {
        const res = await fetch(`${API_URL}/threshold/requests/${reqId}/approve`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json()).error || 'Approve failed');
        showToast('success', 'Request Approved', `Request ${reqId} approved. Max threshold updated immediately.`);
        await loadPendingRequests();
        await loadGovernanceProducts(); // Sync the governance table
        await loadAuditLog();
      } catch (err) {
        showToast('error', 'Approve Failed', err.message || 'Could not approve request.');
      }
    }
  );
};

// Open reject reason modal
let _pendingRejectId = null;
window.openRejectModal = function (reqId) {
  _pendingRejectId = reqId;
  const modal = document.getElementById('reject-reason-modal');
  const input = document.getElementById('reject-reason-input');
  const errEl = document.getElementById('reject-reason-err');
  const group = document.getElementById('reject-reason-group');
  if (!modal) return;
  if (input) input.value = '';
  if (errEl) errEl.style.display = 'none';
  if (group) group.classList.remove('has-error');
  modal.style.display = 'flex';
  if (window.lucide) window.lucide.createIcons({ root: modal });

  document.getElementById('reject-reason-confirm').onclick = async () => {
    const reason = input ? input.value.trim() : '';
    if (!reason) {
      if (group) group.classList.add('has-error');
      if (errEl) errEl.style.display = 'block';
      return;
    }
    try {
      const res = await fetch(`${API_URL}/threshold/requests/${_pendingRejectId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectReason: reason })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Reject failed');
      modal.style.display = 'none';
      showToast('info', 'Request Rejected', `Request ${_pendingRejectId} rejected. Reason logged.`);
      await loadPendingRequests();
      await loadAuditLog();
    } catch (err) {
      showToast('error', 'Reject Failed', err.message || 'Could not reject request.');
    }
    _pendingRejectId = null;
  };
};

// Branch matching logic: case-insensitive ID or string matching + default display for products without explicit branch
function matchProductBranch(p, selectedBranch) {
  if (!selectedBranch || selectedBranch.toString().trim().toLowerCase() === 'all') {
    return true;
  }

  // If a product does not have an explicit branch assigned, default it to display rather than filtering it out
  const pBranchId = (p.branchId || p.branch_id || '').toString().trim();
  const pBranchName = (p.branch || p.branchName || p.branch_name || '').toString().trim();
  if (!pBranchId && !pBranchName) {
    return true;
  }

  const sel = selectedBranch.toString().trim().toLowerCase();

  // Case-insensitive ID matching
  if (pBranchId && pBranchId.toLowerCase() === sel) return true;
  // Case-insensitive Name matching
  if (pBranchName && pBranchName.toLowerCase() === sel) return true;

  // Cross-reference with appBranches registry
  const bObj = (appBranches || []).find(b =>
    (b.id && b.id.toString().trim().toLowerCase() === sel) ||
    (b.name && b.name.toString().trim().toLowerCase() === sel)
  );
  if (bObj) {
    const bId = (bObj.id || '').toLowerCase();
    const bName = (bObj.name || '').toLowerCase();
    if (pBranchId && (pBranchId.toLowerCase() === bId || pBranchId.toLowerCase() === bName)) return true;
    if (pBranchName && (pBranchName.toLowerCase() === bId || pBranchName.toLowerCase() === bName)) return true;
  }

  // Partial / fuzzy substring matching (e.g., 'montalban' matches 'branch-montalban')
  if (pBranchId && (pBranchId.toLowerCase().includes(sel) || sel.includes(pBranchId.toLowerCase()))) return true;
  if (pBranchName && (pBranchName.toLowerCase().includes(sel) || sel.includes(pBranchName.toLowerCase()))) return true;

  return false;
}

// Load all products with threshold config using exact same fetch URL and headers as inventory.html
async function loadGovernanceProducts() {
  const tbody = document.getElementById('governance-products-body');
  try {
    // Seed immediately from in-memory appProducts if available
    if (thresholdProducts.length === 0 && Array.isArray(appProducts) && appProducts.length > 0) {
      thresholdProducts = appProducts.map(normalizeProductThreshold);
      populateBranchFilter();
      renderGovernanceTable();
    }

    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Exact same fetch URL and authentication headers as inventory.html
    // Include ?branch=all to ensure administrators load all items across all branches
    const url = `${API_URL}/inventory?branch=all`;
    let res = await fetch(url, { headers }).catch(e => {
      console.warn('[Threshold] Fetch error with ?branch=all:', e);
      return null;
    });

    if (!res || !res.ok) {
      // Fallback: try direct /api/inventory without query parameter
      res = await fetch(`${API_URL}/inventory`, { headers }).catch(e => {
        console.warn('[Threshold] Fetch error without query:', e);
        return null;
      });
    }

    let rawData = null;
    if (res && res.ok) {
      rawData = await res.json().catch(e => {
        console.error('[Threshold] Failed to parse JSON:', e);
        return null;
      });
    }

    // Required: Log the raw API response to console.log() inside threshold.html
    console.log('[Threshold] Raw Inventory API response:', rawData);

    // Response handling: correctly unpack array whether direct array [...] or object payload { success: true, data: [...] }
    let items = [];
    if (Array.isArray(rawData)) {
      items = rawData;
    } else if (rawData && typeof rawData === 'object') {
      if (Array.isArray(rawData.data)) {
        items = rawData.data;
      } else if (Array.isArray(rawData.products)) {
        items = rawData.products;
      } else if (Array.isArray(rawData.items)) {
        items = rawData.items;
      } else if (Array.isArray(rawData.inventory)) {
        items = rawData.inventory;
      } else if (Array.isArray(rawData.rows)) {
        items = rawData.rows;
      } else if (Array.isArray(rawData.result)) {
        items = rawData.result;
      }
    }

    // Fallback: If network returned empty, use in-memory appProducts if available
    if (items.length === 0 && Array.isArray(appProducts) && appProducts.length > 0) {
      console.log('[Threshold] Fallback: using appProducts array from application context:', appProducts);
      items = [...appProducts];
    }

    thresholdProducts = items.map(normalizeProductThreshold);

    console.log(`[Threshold] Loaded ${thresholdProducts.length} total product(s) for Governance Controls:`, thresholdProducts);

    // Refresh branch filter options with all branches discovered
    populateBranchFilter();

    govCurrentPage = 1;
    renderGovernanceTable();
  } catch (err) {
    console.error('[Threshold] Error loading governance products:', err);
    if (tbody && (!thresholdProducts || thresholdProducts.length === 0)) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red-600);padding:24px;">Failed to load products: ${escapeHtml(err.message || 'Unknown error')}</td></tr>`;
    }
  }
}

function renderGovernanceTable() {
  const tbody = document.getElementById('governance-products-body');
  if (!tbody) return;

  const searchQ  = (document.getElementById('thresh-product-search')?.value || '').trim().toLowerCase();
  const branchSel = (document.getElementById('thresh-branch-filter')?.value || 'all').trim();

  let filtered = thresholdProducts || [];

  // Filter by search query
  if (searchQ) {
    filtered = filtered.filter(p =>
      (p.name && p.name.toLowerCase().includes(searchQ)) ||
      (p.category && p.category.toLowerCase().includes(searchQ)) ||
      (p.id && String(p.id).toLowerCase().includes(searchQ))
    );
  }

  // Filter by branch with case-insensitive ID/name matching + default display for products without explicit branch
  filtered = filtered.filter(p => matchProductBranch(p, branchSel));

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / GOV_PAGE_SIZE) || 1;
  if (govCurrentPage > totalPages) govCurrentPage = totalPages;
  if (govCurrentPage < 1) govCurrentPage = 1;
  const start     = (govCurrentPage - 1) * GOV_PAGE_SIZE;
  const paginated = filtered.slice(start, start + GOV_PAGE_SIZE);

  if (paginated.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="thr-empty-state"><i data-lucide="package-search" class="lucide-icon"></i><div>No products match your filter.</div></div></td></tr>`;
    if (window.lucide) window.lucide.createIcons({ root: tbody });
  } else {
    tbody.innerHTML = paginated.map(p => {
      const minVal = p.min_threshold !== undefined && p.min_threshold !== null ? p.min_threshold : 0;
      const maxVal = p.max_threshold !== undefined && p.max_threshold !== null ? p.max_threshold : 0;
      const isEnf = Boolean(p.is_enforced);

      const stockColor = maxVal > 0 && p.quantity > maxVal ? 'var(--red-600)'
                       : minVal > 0 && p.quantity < minVal ? 'var(--amber-500)'
                       : 'inherit';

      const displayBranch = p.branchId ? branchName(p.branchId) : (p.branch || 'All Branches');

      return `
        <tr data-prodid="${escapeHtml(p.id)}">
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td style="font-size:12px;">${escapeHtml(displayBranch)}</td>
          <td>${categoryBadge(p.category)}</td>
          <td style="font-weight:700;color:${stockColor};">${p.quantity}</td>
          <td class="col-thresh">
            <input type="number" class="thresh-input" id="min-${p.id}"
              value="${minVal}" min="0" placeholder="0" title="Min threshold for ${escapeHtml(p.name)}">
          </td>
          <td class="col-thresh">
            <input type="number" class="thresh-input" id="max-${p.id}"
              value="${maxVal}" min="0" placeholder="0" title="Max threshold for ${escapeHtml(p.name)}">
          </td>
          <td class="col-enforced">
            <label class="enforced-switch" title="Toggle individual enforcement">
              <input type="checkbox" id="enf-${p.id}" ${isEnf ? 'checked' : ''}>
              <span class="enforced-slider"></span>
            </label>
          </td>
          <td class="col-action">
            <button class="thresh-save-btn" onclick="saveProductThreshold('${escapeHtml(p.id)}')">
              <i data-lucide="save" class="lucide-icon" style="width:12px;height:12px;"></i> Save
            </button>
          </td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons({ root: tbody });
  }

  // Pagination controls
  const pageInfo = document.getElementById('gov-page-info');
  const prevBtn  = document.getElementById('gov-prev');
  const nextBtn  = document.getElementById('gov-next');
  if (pageInfo) {
    const displayPage = totalItems > 0 ? govCurrentPage : 1;
    pageInfo.textContent = `Page ${displayPage} of ${totalPages} (${totalItems} product${totalItems === 1 ? '' : 's'})`;
  }
  if (prevBtn) {
    prevBtn.disabled = govCurrentPage <= 1;
    prevBtn.onclick  = () => {
      if (govCurrentPage > 1) {
        govCurrentPage--;
        renderGovernanceTable();
      }
    };
  }
  if (nextBtn) {
    nextBtn.disabled = govCurrentPage >= totalPages || totalItems === 0;
    nextBtn.onclick  = () => {
      if (govCurrentPage < totalPages) {
        govCurrentPage++;
        renderGovernanceTable();
      }
    };
  }
}

// Save individual product threshold
window.saveProductThreshold = async function (prodId) {
  const minInput = document.getElementById(`min-${prodId}`);
  const maxInput = document.getElementById(`max-${prodId}`);
  const enfInput = document.getElementById(`enf-${prodId}`);
  if (!minInput || !maxInput || !enfInput) return;

  const min = parseInt(minInput.value, 10);
  const max = parseInt(maxInput.value, 10);
  const enf = enfInput.checked;

  // Client-side validation
  if (isNaN(min) || min < 0) { minInput.classList.add('invalid'); showToast('error', 'Invalid Min', 'Min threshold must be 0 or greater.'); return; }
  if (isNaN(max) || max < 0) { maxInput.classList.add('invalid'); showToast('error', 'Invalid Max', 'Max threshold must be 0 or greater.'); return; }
  if (max > 0 && min > max)  { minInput.classList.add('invalid'); showToast('error', 'Invalid Thresholds', 'Min threshold cannot exceed Max threshold.'); return; }
  minInput.classList.remove('invalid');
  maxInput.classList.remove('invalid');

  const cached = (thresholdProducts || []).find(p => p.id === prodId);
  const branchId = cached ? (cached.branchId || cached.branch_id || cached.branch) : undefined;

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const payload = {
    min_threshold: min,
    max_threshold: max,
    is_enforced: enf,
    ...(branchId ? { branchId } : {})
  };

  try {
    let res = await fetch(`${API_URL}/threshold/products/${encodeURIComponent(prodId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      // Fallback: If /api/threshold/products/:id returned non-200, try /api/inventory/:id
      res = await fetch(`${API_URL}/inventory/${encodeURIComponent(prodId)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || (errData.details && errData.details.join(', ')) || 'Save failed');
    }

    // Sync local cache
    if (cached) {
      cached.min_threshold = min;
      cached.max_threshold = max;
      cached.is_enforced = enf;
    }
    const appProd = (appProducts || []).find(p => p.id === prodId);
    if (appProd) {
      appProd.min_threshold = min;
      appProd.max_threshold = max;
      appProd.is_enforced = enf;
    }

    showToast('success', 'Thresholds Saved', `Thresholds updated for product ${prodId}.`);
    await loadAuditLog();
  } catch (err) {
    console.error('[Threshold] Error saving thresholds:', err);
    showToast('error', 'Save Failed', err.message || 'Could not save thresholds.');
  }
};

// Load audit trail
async function loadAuditLog() {
  const tbody = document.getElementById('audit-log-body');
  if (!tbody) return;
  try {
    const res = await fetch(`${API_URL}/threshold/audit`);
    const entries = res.ok ? await res.json() : [];
    const recent  = entries.slice(0, 20);

    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="thr-empty-state"><i data-lucide="file-clock" class="lucide-icon"></i><div>No governance events recorded yet.</div></div></td></tr>`;
      if (window.lucide) window.lucide.createIcons({ root: tbody });
      return;
    }

    const eventLabel = (e) => {
      const map = {
        STOCK_IN_BLOCKED_MAX_THRESHOLD: { cls: 'block',   label: 'Stock-In Blocked' },
        NEGATIVE_BALANCE_PREVENTED:     { cls: 'block',   label: 'Zero-Balance Block' },
        CRITICAL_LOW_STOCK:             { cls: 'low',     label: 'Critical Low Stock' },
        THRESHOLD_CONFIG_UPDATED:       { cls: 'config',  label: 'Config Updated' },
        EXPANSION_REQUEST_APPROVED:     { cls: 'approve', label: 'Request Approved' },
        EXPANSION_REQUEST_REJECTED:     { cls: 'reject',  label: 'Request Rejected' },
        GLOBAL_ENFORCEMENT_TOGGLED:     { cls: 'toggle',  label: 'Enforcement Toggled' },
      };
      return map[e] || { cls: 'config', label: e };
    };

    tbody.innerHTML = recent.map(entry => {
      const { cls, label } = eventLabel(entry.event);
      const detail = entry.productName
        ? `${escapeHtml(entry.productName)}${entry.attempted ? ` (tried: ${entry.attempted})` : entry.newMax ? ` → max: ${entry.newMax}` : ''}`
        : entry.rejectReason ? `Reason: ${escapeHtml(entry.rejectReason.substring(0, 40))}…` : '—';
      const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—';
      return `<tr>
        <td style="font-size:12px;white-space:nowrap;">${ts}</td>
        <td><span class="audit-event-pill ${cls}">${label}</span></td>
        <td style="font-size:12.5px;max-width:200px;">${detail}</td>
        <td style="font-size:12px;">${escapeHtml(branchName(entry.branchId))}</td>
        <td style="font-size:12px;font-family:monospace;">${escapeHtml(entry.actor || '—')}</td>
      </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons({ root: tbody });
  } catch (err) {
    console.error('[Threshold] Failed to load audit log:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMPLOYEE: Setup
// ─────────────────────────────────────────────────────────────────────────────
async function setupThresholdEmployee() {
  // Populate product dropdown from the employee's branch
  const sel = document.getElementById('product-select');
  if (sel && appProducts.length) {
    sel.innerHTML = `<option value="">Select a product from your branch…</option>` +
      appProducts.map(p => `<option value="${p.id}" data-min="${p.min_threshold || 0}" data-max="${p.max_threshold || 0}" data-qty="${p.quantity}" data-unit="${escapeHtml(p.unit)}">${escapeHtml(p.name)} (${p.quantity} ${p.unit})</option>`).join('');
  }

  // Show live threshold preview when a product is selected
  sel?.addEventListener('change', () => {
    const opt = sel.options[sel.selectedIndex];
    const preview = document.getElementById('product-threshold-preview');
    if (!opt.value || !preview) { if (preview) preview.style.display = 'none'; return; }
    document.getElementById('prev-current').textContent = opt.dataset.qty || '0';
    document.getElementById('prev-min').textContent     = opt.dataset.min || 'Not set';
    document.getElementById('prev-max').textContent     = opt.dataset.max || 'Not set';
    preview.style.display = 'block';
  });

  // Handle extension request form submission
  const form = document.getElementById('extension-request-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-request');

      // Clear prior errors
      ['fg-product','fg-requested-max','fg-reason'].forEach(id => {
        document.getElementById(id)?.classList.remove('has-error');
      });
      ['err-product','err-requested-max','err-reason'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      const productId    = document.getElementById('product-select').value;
      const requestedMax = parseInt(document.getElementById('requested-max').value, 10);
      const reason       = document.getElementById('request-reason').value.trim();
      const selEl        = document.getElementById('product-select');
      const currentMax   = parseInt(selEl.options[selEl.selectedIndex]?.dataset?.max || '0', 10);

      let valid = true;
      if (!productId) {
        document.getElementById('fg-product')?.classList.add('has-error');
        const err = document.getElementById('err-product'); if (err) err.style.display = 'block';
        valid = false;
      }
      if (isNaN(requestedMax) || requestedMax <= 0) {
        document.getElementById('fg-requested-max')?.classList.add('has-error');
        const err = document.getElementById('err-requested-max');
        if (err) { err.textContent = 'Please enter a valid quantity greater than 0.'; err.style.display = 'block'; }
        valid = false;
      } else if (requestedMax <= currentMax) {
        document.getElementById('fg-requested-max')?.classList.add('has-error');
        const err = document.getElementById('err-requested-max');
        if (err) { err.textContent = `Requested max (${requestedMax}) must exceed current max threshold (${currentMax}).`; err.style.display = 'block'; }
        valid = false;
      }
      if (!reason) {
        document.getElementById('fg-reason')?.classList.add('has-error');
        const err = document.getElementById('err-reason'); if (err) err.style.display = 'block';
        valid = false;
      }
      if (!valid) return;

      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i data-lucide="loader" class="lucide-icon"></i> Submitting...'; if (window.lucide) window.lucide.createIcons({ root: submitBtn }); }

      try {
        const res = await fetch(`${API_URL}/threshold/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, requestedMax, reason })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data.details || [data.error]).join(', '));

        showToast('success', 'Request Submitted', `Limit expansion request ${data.id} submitted. Admin will review shortly.`, 6000);
        form.reset();
        const preview = document.getElementById('product-threshold-preview');
        if (preview) preview.style.display = 'none';
        // Refresh history table
        await loadEmployeeHistory();
      } catch (err) {
        showToast('error', 'Submission Failed', err.message || 'Could not submit request.');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-lucide="send" class="lucide-icon"></i> Submit Request'; if (window.lucide) window.lucide.createIcons({ root: submitBtn }); }
      }
    });
  }

  // Load request history
  await loadEmployeeHistory();
}

async function loadEmployeeHistory() {
  const tbody = document.getElementById('employee-history-body');
  if (!tbody) return;
  try {
    const res = await fetch(`${API_URL}/threshold/requests`);
    const all = res.ok ? await res.json() : [];

    if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="thr-empty-state"><i data-lucide="history" class="lucide-icon"></i><div>No requests submitted yet.</div></div></td></tr>`;
      if (window.lucide) window.lucide.createIcons({ root: tbody });
      return;
    }

    tbody.innerHTML = all.map(r => {
      const statusClass = r.status === 'PENDING' ? 'pending' : r.status === 'APPROVED' ? 'approved' : 'rejected';
      const statusIcon  = r.status === 'PENDING' ? 'clock' : r.status === 'APPROVED' ? 'check-circle' : 'x-circle';
      const notes = r.status === 'REJECTED' && r.rejectReason
        ? `<span style="font-size:11.5px;color:var(--red-600);">Rejected: ${escapeHtml(r.rejectReason)}</span>`
        : r.status === 'APPROVED'
        ? `<span style="font-size:11.5px;color:var(--green-600);">Max updated to ${r.requestedMax}</span>`
        : '<span style="color:var(--slate-400);font-size:12px;">Awaiting review</span>';
      return `<tr>
        <td><code style="font-size:12px;">${escapeHtml(r.id)}</code></td>
        <td style="font-size:13px;">${escapeHtml(r.productName)}</td>
        <td style="font-weight:700;">${r.requestedMax}</td>
        <td><span class="req-status-badge ${statusClass}"><i data-lucide="${statusIcon}" class="lucide-icon" style="width:10px;height:10px;"></i> ${r.status}</span></td>
        <td style="font-size:12px;white-space:nowrap;">${r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}</td>
        <td>${notes}</td>
      </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons({ root: tbody });
  } catch (err) {
    console.error('[Threshold] Failed to load employee history:', err);
  }
}

window.closeWidgetFullscreen = function () {
  const modal = document.getElementById('widget-fullscreen-modal');
  if (modal) modal.style.display = 'none';
  if (fullscreenChartInstance) {
    fullscreenChartInstance.destroy();
    fullscreenChartInstance = null;
  }
  document.getElementById('wf-body').innerHTML = '';
  currentFullscreenWidgetId = null;
};

// =============================================
//  SIDEBAR REAL-TIME CLOCK
// =============================================
function initSidebarClock() {
  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;

  const clockDiv = document.createElement("div");
  clockDiv.className = "sidebar-clock";
  clockDiv.id = "sidebar-clock";
  clockDiv.innerHTML = `<i data-lucide="clock" class="lucide-icon" style="width:14px;height:14px;"></i> <span id="clock-time">--:--:-- --</span>`;
  
  themeToggle.parentNode.insertBefore(clockDiv, themeToggle);
  if (window.lucide) window.lucide.createIcons({ root: clockDiv });

  function updateClock() {
    const timeSpan = document.getElementById("clock-time");
    if (!timeSpan) return;
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');
    timeSpan.textContent = `${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// =============================================
//  DOM READY — ROUTER
// =============================================
document.addEventListener("DOMContentLoaded", async function () {
  initTheme();
  initSidebarClock();

  try {
    const safeFetch = async (url) => {
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return null;
      return await res.json().catch(() => null);
    };
    // Admin GETs carry a ?branch filter (all | one branch). Staff send nothing —
    // the server scopes them to their own branch from the token.
    const bq = branchQuery();
    const [uRes, pRes, tRes, settingsRes, bRes] = await Promise.all([
      safeFetch(`${API_URL}/users`),
      safeFetch(`${API_URL}/inventory${bq}`),
      safeFetch(`${API_URL}/transactions${bq}`),
      safeFetch(`${API_URL}/settings`),
      safeFetch(`${API_URL}/branches`)
    ]);
    const unpackPayloadList = (r) => {
      if (Array.isArray(r)) return r;
      if (r && typeof r === 'object') {
        if (Array.isArray(r.data)) return r.data;
        if (Array.isArray(r.products)) return r.products;
        if (Array.isArray(r.items)) return r.items;
        if (Array.isArray(r.inventory)) return r.inventory;
        if (Array.isArray(r.rows)) return r.rows;
      }
      return [];
    };
    appUsers = unpackPayloadList(uRes);
    appProducts = unpackPayloadList(pRes);
    appTxns = unpackPayloadList(tRes);
    appBranches = unpackPayloadList(bRes);

    // Sync server-side settings into localStorage so all pages read consistent values
    if (settingsRes && typeof settingsRes === 'object') {
      if ('lowStockThreshold' in settingsRes) {
        localStorage.setItem('lowStockThreshold', settingsRes.lowStockThreshold);
      }
      if ('lowStockProtectionEnabled' in settingsRes) {
        localStorage.setItem('lowStockProtectionEnabled', settingsRes.lowStockProtectionEnabled);
      }
      if ('global_threshold_enforcement' in settingsRes) {
        localStorage.setItem('global_threshold_enforcement', String(settingsRes.global_threshold_enforcement));
      }
    }
  } catch (e) {
    console.error("API error during init", e);
  }

  requireAuth();

  const userRole = localStorage.getItem("userRole");
  const displayName = localStorage.getItem("displayName");

  setText("displayName", displayName || "");
  setText("displayRole", userRole === "admin" ? "Administrator" : userRole === "staff" ? "Staff" : "");

  const avatarEl = document.getElementById("userAvatar");
  if (avatarEl && displayName) {
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
  }

  if (userRole === "admin") {
    document.body.classList.add("is-admin");
  }

  setActiveNav();
  renderBranchContext();

  if (userRole && !sessionStorage.getItem("welcomeShown")) {
    showWelcomeModal(displayName, userRole);
    sessionStorage.setItem("welcomeShown", "true");
  }

  setupCommandPalette();
  setupSearchShortcut();
  ensureToastContainer();
  setupResponsiveSidebar();

  const page = window.location.pathname.split("/").pop();
  if (page === "index.html" || page === "") { setupLoginEnterKey(); setupPasswordToggle(); }
  if (page === "dashboard.html") { loadDashboard(); setTimeout(animateStatCounters, 100); }
  if (page === "inventory.html") { loadInventory(); setupInventoryFilters(); setTimeout(animateStatCounters, 100); }
  if (page === "stock-in.html") setupStockIn();
  if (page === "stock-out.html") setupStockOut();
  if (page === "transactions.html") { loadTransactions(); setupTransactionFilters(); }
  if (page === "users.html" && userRole === "admin") { loadUsers(); setupUserManagement(); }
  if (page === "threshold.html") setupThreshold();
});
