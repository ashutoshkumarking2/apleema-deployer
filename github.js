let allLoadedRepos = [];
let deployedProjectsList = [];

export function initGitHubModule(currentUser) {
  window.currentUserObj = currentUser;
  const repoDisplay = document.getElementById('repoDisplay');

  const urlParams = new URLSearchParams(window.location.search);
  const reposEncoded = urlParams.get('repos');

  if (reposEncoded && repoDisplay) {
    if (reposEncoded === 'empty') {
      repoDisplay.innerHTML = `<div class="empty-state"><p>No repositories found on this GitHub account.</p></div>`;
    } else {
      try {
        const reposJson = atob(decodeURIComponent(reposEncoded));
        allLoadedRepos = JSON.parse(reposJson);
        renderRepoList(allLoadedRepos);
        updateOverviewStats();
      } catch (e) {
        console.error("Failed to parse repository data", e);
      }
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

window.triggerGitHubConnect = function() {
  const currentUser = window.currentUserObj;
  const uid = currentUser ? currentUser.uid : 'guest';
  window.location.href = `http://localhost:3000/api/auth/github/repo?uid=${encodeURIComponent(uid)}`;
};

function renderRepoList(repos) {
  const repoDisplay = document.getElementById('repoDisplay');
  if (!repoDisplay) return;

  if (repos.length === 0) {
    repoDisplay.innerHTML = `<div class="empty-state"><p>No repositories match your search.</p></div>`;
    return;
  }

  let html = '';
  repos.forEach(repo => {
    html += `
      <div class="repo-card">
        <div>
          <div class="repo-header">
            <a href="${escapeHtml(repo.url)}" target="_blank" class="repo-name">📦 ${escapeHtml(repo.name)}</a>
            <span class="badge ${repo.visibility === 'Private' ? 'private' : 'public'}">${escapeHtml(repo.visibility)}</span>
          </div>
          <p class="repo-desc">${escapeHtml(repo.description || 'No description provided.')}</p>
        </div>
        <div class="repo-footer">
          <span>Branch: <strong>${escapeHtml(repo.branch)}</strong></span>
          <button class="btn-deploy" onclick="openDeployModal('${escapeHtml(repo.owner)}', '${escapeHtml(repo.name)}', '${escapeHtml(repo.branch)}', '${escapeHtml(repo.id)}')">Deploy →</button>
        </div>
      </div>
    `;
  });

  repoDisplay.innerHTML = html;
}

window.filterRepos = function() {
  const query = document.getElementById('repoSearch').value.toLowerCase();
  const filtered = allLoadedRepos.filter(r => r.name.toLowerCase().includes(query) || (r.description && r.description.toLowerCase().includes(query)));
  renderRepoList(filtered);
};

window.openDeployModal = function(owner, repo, defaultBranch, repoId) {
  document.getElementById('confRepoOwner').value = owner;
  document.getElementById('confRepoName').value = repo;
  document.getElementById('confRepoId').value = repoId;
  document.getElementById('confProjectName').value = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  document.getElementById('confBranch').value = defaultBranch || 'main';

  // Reset Env Vars builder
  document.getElementById('envVarsBuilderContainer').innerHTML = '';
  addEnvRow(); // add initial empty row

  document.getElementById('deployModal').classList.add('active');
};

window.closeDeployModal = function() {
  document.getElementById('deployModal').classList.remove('active');
};

window.addEnvRow = function(key = '', val = '') {
  const container = document.getElementById('envVarsBuilderContainer');
  const row = document.createElement('div');
  row.className = 'env-row-item';
  row.innerHTML = `
    <input type="text" class="input-control env-key" placeholder="KEY (e.g. API_KEY)" value="${escapeHtml(key)}">
    <input type="text" class="input-control env-val" placeholder="VALUE" value="${escapeHtml(val)}">
    <button type="button" class="btn-secondary" onclick="this.parentElement.remove()" style="padding: 10px 12px;">✕</button>
  `;
  container.appendChild(row);
};

window.executeDeployment = async function(event) {
  event.preventDefault();

  const projectName = document.getElementById('confProjectName').value;
  const repoOwner = document.getElementById('confRepoOwner').value;
  const repoName = document.getElementById('confRepoName').value;
  const repoId = document.getElementById('confRepoId').value;
  const branch = document.getElementById('confBranch').value;
  const framework = document.getElementById('confFramework').value;

  // Collect Environment Variables from Builder
  const envVars = {};
  document.querySelectorAll('.env-row-item').forEach(row => {
    const k = row.querySelector('.env-key').value.trim();
    const v = row.querySelector('.env-val').value.trim();
    if (k) envVars[k] = v;
  });

  const submitBtn = document.getElementById('submitDeployBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Triggering Deployment...';

  try {
    const response = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName,
        repoOwner,
        repoName,
        repoId,
        branch,
        framework,
        envVars
      })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      showToast('Deployment triggered successfully!', 'success');
      closeDeployModal();

      const deployRecord = {
        name: projectName,
        repo: `${repoOwner}/${repoName}`,
        branch,
        url: data.deployment.url ? `https://${data.deployment.url}` : '#',
        createdAt: new Date().toLocaleTimeString()
      };

      deployedProjectsList.unshift(deployRecord);
      renderProjectsAndDeployments();
      updateOverviewStats();

      if (data.deployment.url) {
        setTimeout(() => {
          window.open(`https://${data.deployment.url}`, '_blank');
        }, 1200);
      }
    } else {
      showToast(data.error || 'Deployment failed.', 'error');
    }
  } catch (err) {
    showToast('Failed to communicate with deployment server.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Deploy to Vercel Now';
  }
};

function renderProjectsAndDeployments() {
  const projectsDisplay = document.getElementById('projectsDisplay');
  const deploymentsDisplay = document.getElementById('deploymentsDisplay');
  const recentActivityList = document.getElementById('recentActivityList');

  if (deployedProjectsList.length === 0) return;

  if (projectsDisplay) {
    let pHtml = '';
    deployedProjectsList.forEach(p => {
      pHtml += `
        <div class="repo-card">
          <div>
            <div class="repo-header">
              <span class="repo-name">🚀 ${escapeHtml(p.name)}</span>
              <span class="badge public">Live</span>
            </div>
            <p class="repo-desc">Repository: ${escapeHtml(p.repo)} (${escapeHtml(p.branch)})</p>
          </div>
          <div class="repo-footer">
            <span>Built at ${escapeHtml(p.createdAt)}</span>
            <a href="${escapeHtml(p.url)}" target="_blank" class="btn-deploy">Visit URL →</a>
          </div>
        </div>
      `;
    });
    projectsDisplay.innerHTML = pHtml;
  }

  if (deploymentsDisplay) {
    let dHtml = '';
    deployedProjectsList.forEach(p => {
      dHtml += `
        <div class="activity-item">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <p style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.repo)} [${escapeHtml(p.branch)}]</p>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span class="badge public">READY</span>
            <a href="${escapeHtml(p.url)}" target="_blank" class="btn-deploy">Open</a>
          </div>
        </div>
      `;
    });
    deploymentsDisplay.innerHTML = dHtml;
  }

  if (recentActivityList) {
    let aHtml = '';
    deployedProjectsList.slice(0, 3).forEach(p => {
      aHtml += `
        <div class="activity-item">
          <div>
            <strong>Deployment successful: ${escapeHtml(p.name)}</strong>
            <p style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.repo)}</p>
          </div>
          <a href="${escapeHtml(p.url)}" target="_blank" class="btn-deploy">Visit</a>
        </div>
      `;
    });
    recentActivityList.innerHTML = aHtml;
  }
}

function updateOverviewStats() {
  const statReposCount = document.getElementById('statReposCount');
  const statDeploymentsCount = document.getElementById('statDeploymentsCount');
  if (statReposCount) statReposCount.textContent = allLoadedRepos.length;
  if (statDeploymentsCount) statDeploymentsCount.textContent = deployedProjectsList.length;
}

window.switchView = function(viewName, event) {
  if (event) event.preventDefault();
  
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(m => m.classList.remove('active'));

  const targetView = document.getElementById(`view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
  if (targetView) targetView.classList.add('active');

  const breadcrumb = document.getElementById('currentBreadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
  }

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }
};

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}