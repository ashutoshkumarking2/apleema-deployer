import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import { auth } from "./firebase-config.js";

const authLoadingScreen = document.getElementById('authLoadingScreen');
const authContainer = document.getElementById('authContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const emailForm = document.getElementById('emailForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const submitAuthBtn = document.getElementById('submitAuthBtn');
const statusBanner = document.getElementById('statusBanner');
const btnGoogle = document.getElementById('btnGoogle');
const btnGithubAuth = document.getElementById('btnGithubAuth');

let currentUserObj = null;

function showStatus(message, isError = false) {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${isError ? 'error' : 'success'}`;
}

function clearStatus() {
  if (!statusBanner) return;
  statusBanner.textContent = '';
  statusBanner.className = 'status-banner';
}

if (emailForm) {
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showStatus("Please complete all required fields.", true);
      return;
    }

    submitAuthBtn.disabled = true;
    submitAuthBtn.textContent = "Authenticating...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showStatus("Signed in successfully.");
    } catch (err) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        showStatus("Account created and signed in.");
      } catch (createErr) {
        showStatus(formatFirebaseError(createErr.code), true);
      }
    } finally {
      submitAuthBtn.disabled = false;
      submitAuthBtn.textContent = "Sign In";
    }
  });
}

if (btnGoogle) {
  btnGoogle.addEventListener('click', async () => {
    clearStatus();
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      showStatus(formatFirebaseError(err.code), true);
    }
  });
}

if (btnGithubAuth) {
  btnGithubAuth.addEventListener('click', async () => {
    clearStatus();
    const provider = new OAuthProvider("github.com");
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      showStatus(formatFirebaseError(err.code), true);
    }
  });
}

window.toggleAccountMenu = function(event) {
  event.stopPropagation();
  const menu = document.getElementById('accountDropdownMenu');
  if (menu) menu.classList.toggle('active');
};

window.closeAccountMenu = function() {
  const menu = document.getElementById('accountDropdownMenu');
  if (menu) menu.classList.remove('active');
};

document.addEventListener('click', (e) => {
  const container = document.getElementById('accountDropdownContainer');
  if (container && !container.contains(e.target)) {
    closeAccountMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAccountMenu();
    closeDeployModal();
  }
});

window.handleSignOutAction = async function() {
  closeAccountMenu();
  if (confirm('Are you sure you want to sign out of Apleema?')) {
    try {
      await signOut(auth);
      showToast('Signed out successfully', 'success');
      window.location.href = '/';
    } catch (err) {
      showToast('Error signing out', 'error');
    }
  }
};

onAuthStateChanged(auth, async (user) => {
  if (authLoadingScreen) {
    authLoadingScreen.style.display = 'none';
  }

  if (user) {
    currentUserObj = user;
    if (authContainer) authContainer.style.display = 'none';
    if (dashboardContainer) dashboardContainer.classList.add('active');

    const name = user.displayName || user.email.split('@')[0];
    const email = user.email;
    const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=C4522B&color=fff`;

    document.getElementById('userNameSidebar').textContent = name;
    document.getElementById('userAvatarSidebar').src = avatar;
    document.getElementById('userNameDropdown').textContent = name;
    document.getElementById('userEmailDropdown').textContent = email;
    document.getElementById('userAvatarDropdown').src = avatar;
    document.getElementById('settingsGoogleEmail').textContent = email;

    await checkUserConnections(user.uid);
    
    const { initGitHubModule } = await import('./github.js');
    initGitHubModule(user);
  } else {
    currentUserObj = null;
    if (authContainer) authContainer.style.display = 'grid';
    if (dashboardContainer) dashboardContainer.classList.remove('active');
  }
});

async function checkUserConnections(uid) {
  try {
    const res = await fetch(`/api/user/connections?uid=${encodeURIComponent(uid)}`);
    const data = await res.json();
    if (data.success) {
      const conn = data.connections;
      const githubStatusEl = document.getElementById('menuGithubStatus');
      const settingsGithubMeta = document.getElementById('settingsGithubMeta');
      const settingsGithubAction = document.getElementById('settingsGithubActionContainer');
      const btnConnectRepo = document.getElementById('btnConnectRepo');
      const btnConnectRepoOverview = document.getElementById('btnConnectRepoOverview');

      const menuVercelStatus = document.getElementById('menuVercelStatus');
      const settingsVercelMeta = document.getElementById('settingsVercelMeta');
      const settingsVercelAction = document.getElementById('settingsVercelActionContainer');
      const statVercelStatusBadge = document.getElementById('statVercelStatusBadge');

      // GitHub State
      if (conn.githubConnected && conn.githubUsername) {
        if (githubStatusEl) {
          githubStatusEl.textContent = `@${conn.githubUsername}`;
          githubStatusEl.className = 'txt-success';
        }
        if (settingsGithubMeta) settingsGithubMeta.textContent = `Connected as @${conn.githubUsername}`;
        if (settingsGithubAction) {
          settingsGithubAction.innerHTML = `<button class="btn-secondary" onclick="disconnectGitHubAccount('${uid}')">Disconnect GitHub</button>`;
        }
        if (btnConnectRepo) btnConnectRepo.textContent = 'Refresh Repositories';
        if (btnConnectRepoOverview) btnConnectRepo.textContent = 'Connected GitHub (@' + conn.githubUsername + ')';
      } else {
        if (githubStatusEl) {
          githubStatusEl.textContent = 'Not Connected';
          githubStatusEl.className = '';
        }
        if (settingsGithubMeta) settingsGithubMeta.textContent = 'Status: Not connected';
        if (settingsGithubAction) {
          settingsGithubAction.innerHTML = `<button class="btn-primary" onclick="triggerGitHubConnect()">Connect GitHub</button>`;
        }
      }

      // Vercel State
      if (conn.vercelConnected) {
        if (menuVercelStatus) {
          menuVercelStatus.textContent = 'Connected';
          menuVercelStatus.className = 'txt-success';
        }
        if (settingsVercelMeta) settingsVercelMeta.textContent = 'Token Active (v13 API)';
        if (settingsVercelAction) {
          settingsVercelAction.innerHTML = `<button class="btn-secondary" onclick="disconnectVercelAccount('${uid}')">Disconnect Vercel</button>`;
        }
        if (statVercelStatusBadge) {
          statVercelStatusBadge.textContent = '● Connected';
          statVercelStatusBadge.className = 'stat-value status-live';
        }
      } else {
        if (menuVercelStatus) {
          menuVercelStatus.textContent = 'Disconnected';
          menuVercelStatus.className = '';
        }
        if (settingsVercelMeta) settingsVercelMeta.textContent = 'Status: Disconnected';
        if (settingsVercelAction) {
          settingsVercelAction.innerHTML = `<button class="btn-primary" onclick="connectVercelAccount('${uid}')">Connect Vercel</button>`;
        }
        if (statVercelStatusBadge) {
          statVercelStatusBadge.textContent = '● Disconnected';
          statVercelStatusBadge.className = 'stat-value';
          statVercelStatusBadge.style.color = 'var(--burnt-orange)';
        }
      }
    }
  } catch (err) {
    console.error('Failed to load user connections:', err);
  }
}

window.disconnectGitHubAccount = async function(uid) {
  if (confirm('Disconnecting GitHub will prevent repository imports and deployments. Proceed?')) {
    try {
      const res = await fetch('/api/user/disconnect-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      const data = await res.json();
      if (data.success) {
        showToast('GitHub disconnected successfully.', 'success');
        checkUserConnections(uid);
      }
    } catch (e) {
      showToast('Failed to disconnect GitHub.', 'error');
    }
  }
};

window.disconnectVercelAccount = async function(uid) {
  if (confirm('Disconnecting Vercel will prevent triggering new deployments. Proceed?')) {
    try {
      const res = await fetch('/api/user/disconnect-vercel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Vercel deployment token disconnected.', 'success');
        checkUserConnections(uid);
      }
    } catch (e) {
      showToast('Failed to disconnect Vercel.', 'error');
    }
  }
};

window.connectVercelAccount = async function(uid) {
  try {
    const res = await fetch('/api/user/connect-vercel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Vercel deployment API connected successfully!', 'success');
      checkUserConnections(uid);
    }
  } catch (e) {
    showToast('Failed to connect Vercel.', 'error');
  }
};

function formatFirebaseError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Invalid email or password.";
    case 'auth/email-already-in-use':
      return "An account with this email address already exists.";
    case 'auth/weak-password':
      return "Password should be at least 6 characters long.";
    case 'auth/popup-closed-by-user':
      return "Sign-in popup closed before completion.";
    default:
      return "Authentication error: " + (code || "Unknown state");
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}