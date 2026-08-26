const API = "/api";

const state = {
  links: [],
  editingCode: null
};

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "success") {
  const box = document.getElementById("message");

  if (!box) return;

  box.textContent = message;
  box.className = `message ${type}`;

  setTimeout(() => {
    box.textContent = "";
    box.className = "message";
  }, 4000);
}

function formatDate(date) {
  if (!date) return "-";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return date;
  }

  return d.toLocaleString();
}

function getBaseUrl() {
  return window.location.origin;
}

function renderLinks() {
  const table = document.getElementById("linksTable");

  if (!table) return;

  if (!state.links.length) {
    table.innerHTML = `
      <tr>
        <td colspan="8" class="empty">
          No short links found.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = state.links.map(link => {
    const shortUrl =
      `${getBaseUrl()}/${encodeURIComponent(link.code)}`;

    return `
      <tr>
        <td>
          <strong>${escapeHtml(link.code)}</strong>
        </td>

        <td>
          <a
            href="${escapeHtml(link.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="original-url"
          >
            ${escapeHtml(link.url)}
          </a>
        </td>

        <td>
          <div class="short-url">
            <input
              type="text"
              value="${escapeHtml(shortUrl)}"
              readonly
              onclick="this.select()"
            >
            <button
              type="button"
              class="copy-btn"
              onclick="copyText('${escapeHtml(shortUrl)}')"
            >
              Copy
            </button>
          </div>
        </td>

        <td>
          ${escapeHtml(link.title || "-")}
        </td>

        <td>
          ${Number(link.clicks || 0)}
        </td>

        <td>
          ${formatDate(link.created_at)}
        </td>

        <td>
          <span class="status ${link.active === 0 ? "inactive" : "active"}">
            ${link.active === 0 ? "Inactive" : "Active"}
          </span>
        </td>

        <td>
          <div class="actions">
            <button
              type="button"
              onclick="editLink('${escapeHtml(link.code)}')"
            >
              Edit
            </button>

            <button
              type="button"
              onclick="viewAnalytics('${escapeHtml(link.code)}')"
            >
              Analytics
            </button>

            <button
              type="button"
              class="danger"
              onclick="deleteLink('${escapeHtml(link.code)}')"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadLinks() {
  try {
    const data = await api("/links");

    state.links = Array.isArray(data.links)
      ? data.links
      : [];

    renderLinks();
    updateDashboardStats();
  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

function updateDashboardStats() {
  const totalLinks = state.links.length;

  const totalClicks = state.links.reduce(
    (sum, link) => sum + Number(link.clicks || 0),
    0
  );

  const linksElement =
    document.getElementById("totalLinks");

  const clicksElement =
    document.getElementById("totalClicks");

  if (linksElement) {
    linksElement.textContent = totalLinks;
  }

  if (clicksElement) {
    clicksElement.textContent = totalClicks;
  }
}

async function createOrUpdateLink(event) {
  event.preventDefault();

  const form = event.target;

  const urlInput =
    form.querySelector('[name="url"]');

  const titleInput =
    form.querySelector('[name="title"]');

  const codeInput =
    form.querySelector('[name="code"]');

  const customCode =
    codeInput ? codeInput.value.trim() : "";

  const payload = {
    url: urlInput ? urlInput.value.trim() : "",
    title: titleInput ? titleInput.value.trim() : "",
    code: customCode
  };

  if (!payload.url) {
    showMessage("Please enter a URL.", "error");
    return;
  }

  try {
    let result;

    if (state.editingCode) {
      result = await api(
        `/links?code=${encodeURIComponent(state.editingCode)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

      showMessage(
        result.message || "Link updated successfully."
      );
    } else {
      result = await api("/links", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage(
        result.message || "Short link created successfully."
      );
    }

    resetLinkForm();
    await loadLinks();

  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

function editLink(code) {
  const link = state.links.find(
    item => item.code === code
  );

  if (!link) {
    showMessage("Link not found.", "error");
    return;
  }

  state.editingCode = code;

  const form = document.getElementById("linkForm");

  if (!form) return;

  const urlInput =
    form.querySelector('[name="url"]');

  const titleInput =
    form.querySelector('[name="title"]');

  const codeInput =
    form.querySelector('[name="code"]');

  if (urlInput) {
    urlInput.value = link.url || "";
  }

  if (titleInput) {
    titleInput.value = link.title || "";
  }

  if (codeInput) {
    codeInput.value = link.code || "";
    codeInput.disabled = true;
  }

  const submitButton =
    form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.textContent = "Update Link";
  }

  const cancelButton =
    document.getElementById("cancelEdit");

  if (cancelButton) {
    cancelButton.hidden = false;
  }

  form.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function resetLinkForm() {
  state.editingCode = null;

  const form = document.getElementById("linkForm");

  if (!form) return;

  form.reset();

  const codeInput =
    form.querySelector('[name="code"]');

  if (codeInput) {
    codeInput.disabled = false;
  }

  const submitButton =
    form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.textContent = "Create Short Link";
  }

  const cancelButton =
    document.getElementById("cancelEdit");

  if (cancelButton) {
    cancelButton.hidden = true;
  }
}

async function deleteLink(code) {
  if (!confirm(
    `Delete short link "${code}"? This cannot be undone.`
  )) {
    return;
  }

  try {
    const result = await api(
      `/links?code=${encodeURIComponent(code)}`,
      {
        method: "DELETE"
      }
    );

    showMessage(
      result.message || "Link deleted successfully."
    );

    await loadLinks();

  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

async function viewAnalytics(code) {
  try {
    const data = await api(
      `/analytics?code=${encodeURIComponent(code)}`
    );

    const modal =
      document.getElementById("analyticsModal");

    const content =
      document.getElementById("analyticsContent");

    if (!modal || !content) {
      alert(
        `Clicks: ${data.totalClicks || 0}`
      );
      return;
    }

    const analytics = Array.isArray(data.analytics)
      ? data.analytics
      : [];

    content.innerHTML = `
      <div class="analytics-summary">
        <div class="analytics-card">
          <span>Total Clicks</span>
          <strong>
            ${Number(data.totalClicks || 0)}
          </strong>
        </div>

        <div class="analytics-card">
          <span>Unique Visitors</span>
          <strong>
            ${Number(data.uniqueVisitors || 0)}
          </strong>
        </div>

        <div class="analytics-card">
          <span>Last Click</span>
          <strong>
            ${escapeHtml(
              formatDate(data.lastClick)
            )}
          </strong>
        </div>
      </div>

      <h3>Recent Clicks</h3>

      ${
        analytics.length
          ? `
            <div class="analytics-list">
              ${analytics.map(item => `
                <div class="analytics-row">
                  <span>
                    ${escapeHtml(
                      formatDate(item.created_at)
                    )}
                  </span>

                  <span>
                    ${escapeHtml(
                      item.country || "Unknown"
                    )}
                  </span>

                  <span>
                    ${escapeHtml(
                      item.device || "Unknown"
                    )}
                  </span>
                </div>
              `).join("")}
            </div>
          `
          : `
            <p class="empty">
              No analytics data yet.
            </p>
          `
      }
    `;

    modal.hidden = false;

  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

function closeAnalytics() {
  const modal =
    document.getElementById("analyticsModal");

  if (modal) {
    modal.hidden = true;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showMessage("Short URL copied.");
  } catch (error) {
    const textarea =
      document.createElement("textarea");

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
      showMessage("Short URL copied.");
    } catch (_) {
      showMessage(
        "Unable to copy. Please copy it manually.",
        "error"
      );
    }

    textarea.remove();
  }
}

async function logout() {
  try {
    await api("/logout", {
      method: "POST"
    });

    window.location.href = "/login.html";

  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

async function checkLogin() {
  try {
    const data = await api("/links");

    if (data.authenticated === false) {
      window.location.href = "/login.html";
      return false;
    }

    return true;

  } catch (error) {
    if (
      error.message.toLowerCase().includes("unauthorized") ||
      error.message.toLowerCase().includes("login")
    ) {
      window.location.href = "/login.html";
      return false;
    }

    return true;
  }
}

function setupEvents() {
  const form =
    document.getElementById("linkForm");

  if (form) {
    form.addEventListener(
      "submit",
      createOrUpdateLink
    );
  }

  const cancelButton =
    document.getElementById("cancelEdit");

  if (cancelButton) {
    cancelButton.addEventListener(
      "click",
      resetLinkForm
    );
  }

  const logoutButton =
    document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  const closeButton =
    document.getElementById("closeAnalytics");

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      closeAnalytics
    );
  }

  const modal =
    document.getElementById("analyticsModal");

  if (modal) {
    modal.addEventListener("click", event => {
      if (event.target === modal) {
        closeAnalytics();
      }
    });
  }
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    setupEvents();

    if (
      document.getElementById("linksTable") ||
      document.getElementById("linkForm")
    ) {
      const loggedIn = await checkLogin();

      if (loggedIn) {
        await loadLinks();
      }
    }
  }
);

window.editLink = editLink;
window.deleteLink = deleteLink;
window.viewAnalytics = viewAnalytics;
window.copyText = copyText;
window.closeAnalytics = closeAnalytics;
window.logout = logout;
