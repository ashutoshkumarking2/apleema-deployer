// Firebase Client SDK Configuration (Project: aivora-ai-fc66b)
const firebaseConfig = {
  apiKey: "AIzaSyAVqQKAK7Ou0Wj7yRaWLpjXyw7cD7GCk6Y",
  authDomain: "aivora-ai-fc66b.firebaseapp.com",
  projectId: "aivora-ai-fc66b",
  storageBucket: "aivora-ai-fc66b.firebasestorage.app",
  messagingSenderId: "504131514451",
  appId: "1:504131514451:web:8d699f879c1fd1f6e556a6"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.warn("Firebase already initialized.");
}

let currentUserToken = null;
let currentRepos = [];
let selectedRepoForImport = null;
let currentVercelAccounts = [];

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    currentUserToken = await user.getIdToken();
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('authenticated-layout').classList.remove('hidden');
    
    document.getElementById('user-name').textContent = user.displayName || user.email;
    document.getElementById('user-email').textContent = user.email;
    if (user.photoURL) {
      document.getElementById('user-avatar').src = user.photoURL;
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('github_linked') === 'success') {
      await linkGitHubAccount();
    }

    checkIntegrationsAndLoadDashboard();
  } else {
    currentUserToken = null;
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('authenticated-layout').classList.add('hidden');
  }
});

document.getElementById('google-login-btn').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
    showToast('Signed in successfully with Google!', 'success');
  } catch (error) {
    const errEl = document.getElementById('login-error');
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
  }
});

function handleSignOut() {
  firebase.auth().signOut();
  showToast('Signed out successfully', 'success');
}

function appNavigate(screenId) {
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetScreen = document.getElementById(`screen-${screenId}`);
  if (targetScreen) targetScreen.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-target="${screenId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (screenId === 'deployments') {
    loadDeploymentsHistory();
  } else if (screenId === 'integrations') {
    checkIntegrationsAndLoadDashboard();
  }
}

// Robust API Helper with HTML error interception
async function apiCall(endpoint, method = 'GET', data = null) {
  const headers = {
    'Authorization': `Bearer ${currentUserToken}`,
    'Content-Type': 'application/json'
  };
  const config = { method, headers };
  if (data) config.body = JSON.stringify(data);

  const res = await fetch(endpoint, config);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error(`Invalid JSON response from ${endpoint}:`, text);
    throw new Error(`Server endpoint ${endpoint} returned HTML instead of JSON. Check server routes.`);
  }

  if (!res.ok) throw new Error(json.error || 'API request failed');
  return json;
}

async function checkIntegrationsAndLoadDashboard() {
  try {
    const userStatus = await apiCall('/api/auth/user');
    
    const githubText = document.getElementById('github-status-text');
    const githubBtn = document.getElementById('github-connect-toggle-btn');
    const vercelText = document.getElementById('vercel-status-text');
    const vercelBtn = document.getElementById('vercel-connect-toggle-btn');
    const banner = document.getElementById('integration-banner');

    if (userStatus.githubConnected) {
      githubText.textContent = 'Connected & Authorized';
      githubBtn.textContent = 'Disconnect';
      githubBtn.className = 'btn btn-secondary';
    } else {
      githubText.textContent = 'Not connected';
      githubBtn.textContent = 'Connect GitHub';
      githubBtn.className = 'btn btn-primary';
    }

    if (userStatus.vercelConnected) {
      vercelText.textContent = 'Connected (API Token Active)';
      vercelBtn.textContent = 'Manage';
      vercelBtn.className = 'btn btn-secondary';
    }

    if (!userStatus.githubConnected) {
      banner.classList.remove('hidden');
      document.getElementById('repos-empty').classList.remove('hidden');
      document.getElementById('repos-grid').innerHTML = '';
    } else {
      banner.classList.add('hidden');
      loadRepositories();
      loadVercelTeams();
    }
  } catch (err) {
    console.error('Failed to load user status:', err);
  }
}

function connectGitHub() {
  window.location.href = '/api/github/auth';
}

async function linkGitHubAccount() {
  try {
    await apiCall('/api/github/link', 'POST');
    showToast('GitHub account connected successfully!', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
    checkIntegrationsAndLoadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleGitHubConnection() {
  const userStatus = await apiCall('/api/auth/user');
  if (userStatus.githubConnected) {
    if (confirm('Are you sure you want to disconnect GitHub?')) {
      await apiCall('/api/github', 'DELETE');
      showToast('GitHub disconnected', 'success');
      checkIntegrationsAndLoadDashboard();
    }
  } else {
    connectGitHub();
  }
}

function toggleVercelConnection() {
  showToast('Vercel deployment token is securely configured via environment variables.', 'success');
}

async function loadRepositories() {
  const loading = document.getElementById('repos-loading');
  const grid = document.getElementById('repos-grid');
  const empty = document.getElementById('repos-empty');

  loading.classList.remove('hidden');
  grid.innerHTML = '';
  empty.classList.add('hidden');

  try {
    const data = await apiCall('/api/github/repos');
    currentRepos = data.repos;
    loading.classList.add('hidden');

    if (currentRepos.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    renderRepositories(currentRepos);
  } catch (err) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    showToast(err.message, 'error');
  }
}

function renderRepositories(repos) {
  const grid = document.getElementById('repos-grid');
  grid.innerHTML = '';

  repos.forEach(repo => {
    const card = document.createElement('div');
    card.className = 'repo-card';
    card.innerHTML = `
      <div>
        <div class="repo-header">
          <a href="${repo.html_url}" target="_blank" class="repo-name">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            ${repo.full_name}
          </a>
          <span class="badge ${repo.private ? 'private' : 'public'}">${repo.private ? 'Private' : 'Public'}</span>
        </div>
        <p class="repo-desc">${repo.description || 'No description provided.'}</p>
      </div>
      <div class="repo-footer">
        <div class="repo-lang">
          <span class="lang-dot"></span>
          <span>${repo.language || 'Code'}</span>
        </div>
        <button onclick="openImportScreen('${repo.owner}', '${repo.name}', '${repo.default_branch}')" class="btn btn-primary btn-sm">Import</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterRepositories() {
  const query = document.getElementById('repo-search-input').value.toLowerCase();
  const filtered = currentRepos.filter(r => r.full_name.toLowerCase().includes(query) || (r.description && r.description.toLowerCase().includes(query)));
  renderRepositories(filtered);
}

function setRepoFilter(type, btn) {
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');

  if (type === 'all') {
    renderRepositories(currentRepos);
  } else if (type === 'public') {
    renderRepositories(currentRepos.filter(r => !r.private));
  } else if (type === 'private') {
    renderRepositories(currentRepos.filter(r => r.private));
  }
}

async function loadVercelTeams() {
  try {
    const data = await apiCall('/api/vercel/teams');
    currentVercelAccounts = data.accounts;
    const select = document.getElementById('input-vercel-team');
    select.innerHTML = '';
    currentVercelAccounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load Vercel accounts:', err);
  }
}

function openImportScreen(owner, repo, defaultBranch) {
  selectedRepoForImport = { owner, repo, defaultBranch };
  document.getElementById('import-repo-subtitle').textContent = `Configuring ${owner}/${repo} for deployment`;
  document.getElementById('input-project-name').value = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  document.getElementById('input-branch').value = defaultBranch || 'main';
  
  document.getElementById('env-vars-container').innerHTML = '';
  addEnvVarRow();

  appNavigate('import');
}

function addEnvVarRow(key = '', value = '') {
  const container = document.getElementById('env-vars-container');
  const row = document.createElement('div');
  row.className = 'env-row';
  row.innerHTML = `
    <input type="text" placeholder="Key (e.g. API_KEY)" value="${key}" class="form-control env-key">
    <input type="text" placeholder="Value" value="${value}" class="form-control env-val">
    <button type="button" onclick="this.parentElement.remove()" class="btn btn-secondary btn-sm">✕</button>
  `;
  container.appendChild(row);
}

async function handleImportSubmit(event) {
  event.preventDefault();
  if (!selectedRepoForImport) return;

  const projectName = document.getElementById('input-project-name').value;
  const teamId = document.getElementById('input-vercel-team').value;
  const branch = document.getElementById('input-branch').value;
  const framework = document.getElementById('input-framework').value;
  const rootDirectory = document.getElementById('input-root-dir').value;
  const buildCommand = document.getElementById('input-build-cmd').value;
  const outputDirectory = document.getElementById('input-output-dir').value;
  const installCommand = document.getElementById('input-install-cmd').value;

  const envVars = {};
  document.querySelectorAll('.env-row').forEach(row => {
    const k = row.querySelector('.env-key').value.trim();
    const v = row.querySelector('.env-val').value.trim();
    if (k) envVars[k] = v;
  });

  const payload = {
    projectName,
    repoOwner: selectedRepoForImport.owner,
    repoName: selectedRepoForImport.repo,
    branch,
    teamId,
    framework,
    rootDirectory,
    buildCommand,
    outputDirectory,
    installCommand,
    envVars
  };

  const submitBtn = document.getElementById('deploy-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Triggering Deployment...';

  try {
    appNavigate('deployment');
    const res = await apiCall('/api/deployments', 'POST', payload);
    const dep = res.deployment;

    document.getElementById('dep-id').textContent = dep.id;
    document.getElementById('dep-repo').textContent = `${selectedRepoForImport.owner}/${selectedRepoForImport.repo}`;
    document.getElementById('dep-branch').textContent = branch;
    document.getElementById('dep-url-link').textContent = dep.url ? `https://${dep.url}` : 'Building...';
    document.getElementById('dep-url-link').href = dep.url ? `https://${dep.url}` : '#';

    if (dep.readyState === 'READY') {
      setDeploymentSuccess(dep.url);
    } else {
      pollDeploymentStatus(dep.id);
    }
    showToast('Deployment initiated successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    appNavigate('dashboard');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Deploy Project';
  }
}

async function pollDeploymentStatus(deploymentId) {
  const interval = setInterval(async () => {
    try {
      const data = await apiCall('/api/deployments');
      const dep = data.deployments.find(d => d.id === deploymentId);
      if (dep) {
        if (dep.readyState === 'READY') {
          clearInterval(interval);
          setDeploymentSuccess(dep.url);
        } else if (dep.readyState === 'ERROR' || dep.readyState === 'CANCELED') {
          clearInterval(interval);
          setDeploymentError(dep.readyState);
        }
      }
    } catch (e) {
      console.error('Polling error:', e);
    }
  }, 4000);
}

function setDeploymentSuccess(url) {
  document.getElementById('deployment-status-icon').className = 'status-icon success';
  document.getElementById('deployment-status-icon').innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  document.getElementById('deployment-title-status').textContent = 'Deployment Successful!';
  document.getElementById('deployment-subtitle-status').textContent = 'Your application has been deployed and is live.';
  const siteBtn = document.getElementById('open-site-btn');
  siteBtn.href = url.startsWith('http') ? url : `https://${url}`;
  siteBtn.classList.remove('hidden');
}

function setDeploymentError(state) {
  document.getElementById('deployment-status-icon').className = 'status-icon error';
  document.getElementById('deployment-status-icon').innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  document.getElementById('deployment-title-status').textContent = `Deployment Failed (${state})`;
  document.getElementById('deployment-subtitle-status').textContent = 'Please check your build logs or settings and try again.';
}

async function loadDeploymentsHistory() {
  const list = document.getElementById('deployments-list');
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await apiCall('/api/deployments');
    list.innerHTML = '';
    if (!data.deployments || data.deployments.length === 0) {
      list.innerHTML = '<p class="sub-text" style="text-align: center; padding: 40px;">No deployments recorded yet.</p>';
      return;
    }

    data.deployments.forEach(dep => {
      const item = document.createElement('div');
      item.className = 'deployment-item-card';
      item.innerHTML = `
        <div>
          <strong>${dep.name}</strong>
          <p class="sub-text">${dep.repo} (${dep.branch}) • ${new Date(dep.createdAt).toLocaleString()}</p>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span class="badge ${dep.readyState === 'READY' ? 'public' : 'private'}">${dep.readyState}</span>
          ${dep.url ? `<a href="https://\${dep.url}" target="_blank" class="btn btn-secondary btn-sm">Visit</a>` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = '<p class="sub-text">Failed to load deployment history.</p>';
  }
}