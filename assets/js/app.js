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
const PROD_BACKEND = "https://YOUR-BACKEND.onrender.com";
const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);
// Local dev still works if you run the backend on localhost (it serves /api).
const API_URL = isLocalHost ? "/api" : `${PROD_BACKEND}/api`;

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

// Low Stock Protection — configurable toggle, persisted in localStorage (synced from server settings)
function getLowStockProtectionEnabled() {
  return localStorage.getItem("lowStockProtectionEnabled") === "true";
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
      localStorage.setItem("userRole", data.user.role);
      localStorage.setItem("displayName", data.user.name);
      localStorage.setItem("userId", data.user.id);
      window.location.href = "dashboard.html";
      // We don't restore the button here because the page is redirecting
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

// Account Recovery Modal
function showRecoveryModal(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById("recovery-modal");
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeRecoveryModal() {
  const modal = document.getElementById("recovery-modal");
  if (modal) {
    modal.style.display = "none";
  }
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
  localStorage.removeItem("userRole");
  localStorage.removeItem("displayName");
  localStorage.removeItem("userId");
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

  if (!publicPages.includes(page) && !userRole) {
    window.location.href = "index.html";
    return;
  }

  if (page === "users.html" && userRole !== "admin") {
    window.location.href = "dashboard.html";
  }
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--slate-400);">No users found.</td></tr>`;
    return;
  }

  const currentUserId = localStorage.getItem("userId");

  tbody.innerHTML = users.map(u => {
    const statusClass = u.status === "Active" ? "in" : "out";
    const deleteBtn = u.id !== currentUserId
      ? `<button class="action-icon-btn danger" onclick="deleteUser('${u.id}')" title="Delete User"><i data-lucide="trash-2" class="lucide-icon"></i></button>`
      : `<button class="action-icon-btn danger" disabled title="Cannot delete yourself" style="opacity: 0.5; cursor: not-allowed;"><i data-lucide="trash-2" class="lucide-icon"></i></button>`;

    const toggleIcon = u.status === "Active" ? "lock" : "unlock";
    const toggleTitle = u.status === "Active" ? "Deactivate User" : "Activate User";
    const toggleBtn = u.id !== currentUserId
      ? `<button class="action-icon-btn" onclick="toggleUserStatus('${u.id}')" title="${toggleTitle}"><i data-lucide="${toggleIcon}" class="lucide-icon"></i></button>`
      : `<button class="action-icon-btn" disabled title="Cannot change own status" style="opacity: 0.5; cursor: not-allowed;"><i data-lucide="${toggleIcon}" class="lucide-icon"></i></button>`;

    return `
      <tr>
        <td>${u.id}</td>
        <td>${u.name}</td>
        <td>${u.username}</td>
        <td style="text-transform: capitalize;">${u.role}</td>
        <td><span class="status ${statusClass}">${u.status}</span></td>
        <td style="white-space: nowrap;">
          <button class="action-icon-btn" onclick="viewCredentials('${u.id}')" title="View Credentials"><i data-lucide="eye" class="lucide-icon"></i></button>
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

      const name = nameEl.value.trim();
      const username = userEl.value.trim();
      const password = passEl.value;
      const role = roleEl.value;

      const users = getUsers();
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        setFieldError(userEl, "Username already exists.");
        return;
      }

      const payload = { id: nextUserId(), name, username, password, role, status: "Active" };
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

function openCreateUserModal() {
  const modal = document.getElementById("create-user-modal");
  if (modal) {
    document.getElementById("create-user-form").reset();
    clearFormErrors(document.getElementById("create-user-form"));
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
//  DASHBOARD
// =============================================
function loadDashboard() {
  const products = getProducts();
  const txns = getTransactions();

  const threshold = getLowStockThreshold();
  const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= threshold).length;
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
    const recent = visibleTxns.slice(-5).reverse();
    tbody.innerHTML = recent.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:var(--slate-400);">No transactions yet.</td></tr>`
      : recent.map(t => `
      <tr>
        <td>${t.date}</td>
        <td>${t.product}</td>
        <td><span class="status ${t.type === 'Stock In' ? 'txn-in' : 'txn-out'}">${t.type}</span></td>
        <td>${t.quantity}</td>
        <td>${t.user}</td>
      </tr>`).join("");
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
  renderHeatmap(txns);

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
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--slate-400);">No transactions yet.</td></tr>`;
      setText("stock-in-month", 0);
      setText("stock-out-month", 0);
      // Also clear the activity timeline
      const timeline = document.getElementById("activity-timeline");
      if (timeline) timeline.innerHTML = '<div style="text-align:center; color:var(--slate-400); padding: 20px 0;">No recent activity.</div>';
      showToast('success', 'Display Cleared', 'Recent transactions display has been cleared.');
    });
  }

  // Activity Timeline — respects dashboard clear cutoff
  const dashClearedAfter = localStorage.getItem("clearDashRecentAfter") || "";
  const timelineTxns = dashClearedAfter ? txns.filter(t => t.id > dashClearedAfter) : txns;
  renderActivityTimeline(timelineTxns);

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
          // Logs come DESC by id, so first entry has the highest ID
          localStorage.setItem("clearExportLogAfter", String(logs[0].id));
        }
      } catch (e) { /* still clear the UI even if fetch fails */ }
      const tbody = document.getElementById("export-log-body");
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--slate-400);">No exports recorded yet.</td></tr>`;
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
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 20, usePointStyle: true, boxWidth: 8 } },
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
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } // Slate 500
        },
        y: {
          beginAtZero: true,
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b', padding: 8 },
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
    headers = ['Product Name', 'Category', 'Current Stock', 'Prediction'];
    // Bug Fix: was hardcoded to 10 — now uses the shared getLowStockThreshold() helper
    const threshold = getLowStockThreshold();
    const lowProds = products.filter(p => p.quantity <= threshold);

    // Smart Restock Analytics (Phase 9.4)
    const today = new Date();
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyMs = thirtyAgo.getTime();

    rows = lowProds.map(p => {
      const isOut = p.quantity === 0;
      const color = isOut ? 'var(--red-600)' : 'var(--amber-600)';

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
        <td>${runoutHtml}</td>
      </tr>`;
    });
    if (rows.length === 0) rows = [`<tr><td colspan="4" style="text-align:center;color:var(--slate-400);padding:20px;">No low stock items.</td></tr>`];
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
//  EXPORT LOGS (Admin Dashboard)
// =============================================
async function loadExportLogs() {
  const tbody = document.getElementById("export-log-body");
  if (!tbody) return;
  try {
    const res = await fetch(`${API_URL}/export-logs`);
    const allLogs = await res.json();
    // Filter out logs that were cleared by the user (ID-based)
    const clearedAfter = parseInt(localStorage.getItem("clearExportLogAfter") || "0", 10);
    const logs = clearedAfter > 0 ? allLogs.filter(l => l.id > clearedAfter) : allLogs;
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--slate-400);">No exports recorded yet.</td></tr>`;
    } else {
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${l.date}</td>
          <td>${l.time}</td>
          <td>${l.user}</td>
          <td>${l.type}</td>
        </tr>`).join("");
    }
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
      productPayload = { id: newId, name, category: cat, unit, quantity: qty, dateAdded: dateStr, user: shortName };
      productAction = 'POST';
    }

    const txnId = nextTxnId();
    const txnPayload = { id: txnId, product: txnProduct, category: cat, type: "Stock In", quantity: qty, unit, date: dateStr, time: timeStr, user: shortName };

    showStockInConfirm(txnProduct, cat, qty, existingIndex !== -1 ? appProducts[existingIndex].quantity : 0, unit, async function () {
      try {
        if (productAction === 'POST') {
          await fetch(`${API_URL}/inventory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(productPayload) });
          appProducts.push(productPayload);
        } else {
          await fetch(`${API_URL}/inventory/${newId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(productPayload) });
          appProducts[existingIndex].quantity += qty;
          appProducts[existingIndex].user = shortName;
        }

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

    showStockOutConfirm(prod, qty, async function () {
      const txnId = nextTxnId();
      const txnPayload = { id: txnId, product: prod.name, category: prod.category, type: "Stock Out", quantity: qty, unit: prod.unit, date: getDateStr(), time: getTimeStr(), user: getShortName() };

      try {
        const negativeQty = parseInt("-" + qty, 10);
        const soRes = await fetch(`${API_URL}/inventory/${prodId}/quantity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityDelta: negativeQty }) });
        if (!soRes.ok) {
          const errData = await soRes.json().catch(() => ({}));
          throw errData;
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
        window.dashboardPieChart.update();
      }
    });
  }
}

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
//  DOM READY — ROUTER
// =============================================
document.addEventListener("DOMContentLoaded", async function () {
  initTheme();

  try {
    const safeFetch = async (url) => {
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return null;
      return await res.json().catch(() => null);
    };
    const [uRes, pRes, tRes, settingsRes] = await Promise.all([
      safeFetch(`${API_URL}/users`),
      safeFetch(`${API_URL}/inventory`),
      safeFetch(`${API_URL}/transactions`),
      safeFetch(`${API_URL}/settings`)
    ]);
    appUsers = Array.isArray(uRes) ? uRes : [];
    appProducts = Array.isArray(pRes) ? pRes : [];
    appTxns = Array.isArray(tRes) ? tRes : [];

    // Sync server-side settings into localStorage so all pages read consistent values
    if (settingsRes && typeof settingsRes === 'object') {
      if ('lowStockThreshold' in settingsRes) {
        localStorage.setItem('lowStockThreshold', settingsRes.lowStockThreshold);
      }
      if ('lowStockProtectionEnabled' in settingsRes) {
        localStorage.setItem('lowStockProtectionEnabled', settingsRes.lowStockProtectionEnabled);
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
});
