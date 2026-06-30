// services/render-api.js — Render REST API v1 client
// Enables fully automated Render deployments from the browser.
// Docs: https://api.render.com/v1

const BASE = 'https://api.render.com/v1';

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function api(apiKey, method, path, body) {
  var opts = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  var res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (err) {
    if (err.message && (err.message.indexOf('Failed to fetch') !== -1 || err.message.indexOf('NetworkError') !== -1 || err.message.indexOf('CORS') !== -1)) {
      throw new Error('Cannot reach Render API from your browser (CORS blocked or network error). Check your internet connection or try again later.');
    }
    throw new Error('Network error: ' + err.message);
  }

  if (!res.ok) {
    var errText = '';
    try {
      var errJson = await res.json();
      errText = errJson.message || errJson.error || JSON.stringify(errJson);
    } catch (e) {
      try { errText = await res.text(); } catch (e2) { errText = 'Unknown'; }
    }
    if (res.status === 401) throw new Error('Render API key invalid. Generate one at render.com/account/api-keys');
    if (res.status === 403) throw new Error('Render API access denied. Check your key permissions.');
    if (res.status === 429) throw new Error('Render API rate limit reached. Wait a minute and try again.');
    if (res.status === 404) throw new Error('Render API endpoint not found. The API may have changed.');
    throw new Error('Render API (' + res.status + '): ' + errText);
  }

  var text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return text; }
}

/**
 * Get the owner associated with the API key.
 * @returns {{ id: string, name?: string, email?: string }}
 */
export async function getOwner(apiKey) {
  var data = await api(apiKey, 'GET', '/owners');
  if (!data) throw new Error('Empty response from Render /owners');

  // Handle array response
  var arr = Array.isArray(data) ? data : (data.owners || [data]);
  if (arr.length === 0) throw new Error('No owners found for this Render API key.');

  var entry = arr[0];
  // Response may be { owner: { id, name } } or { id, name } directly
  var owner = entry.owner || entry;
  if (!owner.id) throw new Error('Could not determine owner ID from Render API.');
  return owner;
}

/**
 * Map UI service type to Render API type.
 */
function mapServiceType(uiType) {
  if (uiType === 'static_site') return 'static_site';
  if (uiType === 'worker') return 'worker';
  return 'web_service';
}

/**
 * Create a Render service linked to a GitHub repo.
 * @returns {{ id: string, name: string, type: string, ... }}
 */
export async function createService(apiKey, config) {
  var body = {
    type: mapServiceType(config.serviceType),
    name: config.name,
    ownerId: config.ownerId,
    repo: config.repoUrl,
    branch: config.branch || 'main',
    autoDeploy: true,
    serviceDetails: {},
  };

  if (config.serviceType === 'static_site') {
    body.serviceDetails = {
      buildCommand: config.buildCommand || '',
      publishPath: config.publishPath || '.',
      pullRequestPreviewsEnabled: false,
    };
  } else {
    body.serviceDetails = {
      env: config.runtime || 'node',
      buildCommand: config.buildCommand || 'npm install',
      startCommand: config.startCommand || 'npm start',
      plan: config.plan || 'starter',
      region: config.region || 'oregon',
      numInstances: config.numInstances || 1,
    };
    if (config.disk && config.disk.enabled) {
      body.serviceDetails.disk = {
        name: config.disk.name || 'data',
        mountPath: config.disk.mountPath || '/data',
        sizeGB: parseInt(config.disk.sizeGB) || 1,
      };
    }
  }

  return api(apiKey, 'POST', '/services', body);
}

/**
 * Set environment variables on a service.
 */
export async function setEnvVars(apiKey, serviceId, envVars) {
  if (!envVars || envVars.length === 0) return;
  var vars = envVars
    .filter(function (v) { return v && v.key && v.key.trim(); })
    .map(function (v) { return { key: v.key.trim(), value: String(v.value || '') }; });
  if (vars.length === 0) return;

  // Render API uses PATCH for env vars
  await api(apiKey, 'PATCH', '/services/' + serviceId + '/env-vars', vars);
}

/**
 * Trigger a manual deploy on a service.
 * @returns {Object} Deploy object
 */
export async function triggerDeploy(apiKey, serviceId) {
  return api(apiKey, 'POST', '/services/' + serviceId + '/deploys', { clearCache: 'do_not_clear' });
}

/**
 * Get service details.
 */
export async function getService(apiKey, serviceId) {
  return api(apiKey, 'GET', '/services/' + serviceId);
}

/**
 * Get deploys list for a service (newest first).
 */
export async function getDeploys(apiKey, serviceId) {
  var data = await api(apiKey, 'GET', '/services/' + serviceId + '/deploys');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.deploys)) return data.deploys;
  return [];
}

/**
 * Extract the live URL from a service response.
 */
function extractUrl(service) {
  if (!service) return '';
  // Try nested serviceDetails
  if (service.serviceDetails) {
    if (service.serviceDetails.url) return service.serviceDetails.url;
  }
  if (service.url) return service.url;
  // Construct from name
  if (service.name) return 'https://' + service.name + '.onrender.com';
  return '';
}

/**
 * Map Render deploy status to human-readable message.
 */
function statusLabel(status) {
  var map = {
    created: '⏳ Deploy queued...',
    build_in_progress: '🔨 Building your project...',
    update_in_progress: '🚀 Deploying to production...',
    deploy_in_progress: '🚀 Deploying to production...',
    live: '✅ Live!',
    failed: '❌ Deploy failed',
    canceled: '❌ Deploy canceled',
    deactivated: '⏸️ Service deactivated',
  };
  return map[status] || '⏳ ' + status;
}

/**
 * Poll until a deploy goes live.
 * @param {string} apiKey
 * @param {string} serviceId
 * @param {Function} onLog
 * @param {Function} onProgress
 * @returns {{ status: string, serviceUrl: string }}
 */
export async function pollUntilLive(apiKey, serviceId, onLog, onProgress) {
  var maxAttempts = 120; // 10 minutes at 5s intervals
  var attempt = 0;
  var lastStatus = '';
  var startedAt = Date.now();

  while (attempt < maxAttempts) {
    try {
      var deploys = await getDeploys(apiKey, serviceId);

      if (!deploys || deploys.length === 0) {
        if (attempt < 6) {
          onLog('⏳ Waiting for first deploy to start...');
          onProgress(52 + attempt);
        }
        await sleep(5000);
        attempt++;
        continue;
      }

      // Latest deploy (newest first)
      var deploy = deploys[0];
      var status = deploy.status || '';

      if (status !== lastStatus) {
        lastStatus = status;
        onLog(statusLabel(status));

        if (status === 'live') {
          onProgress(100);
          var service = await getService(apiKey, serviceId);
          return { status: 'live', serviceUrl: extractUrl(service) };
        }

        if (status === 'failed' || status === 'canceled') {
          throw new Error('Deployment ' + status + ' on Render. Check your build logs at dashboard.render.com');
        }
      }

      // Update progress based on time elapsed
      var elapsed = (Date.now() - startedAt) / 1000;
      if (status === 'build_in_progress') {
        onProgress(Math.min(85, 60 + elapsed / 3));
      } else if (status === 'update_in_progress' || status === 'deploy_in_progress') {
        onProgress(Math.min(95, 85 + elapsed / 10));
      } else {
        onProgress(Math.min(60, 50 + elapsed / 5));
      }

    } catch (err) {
      if (err.message.indexOf('failed') !== -1 || err.message.indexOf('canceled') !== -1) {
        throw err;
      }
      // Transient error — keep polling
      if (attempt > 3) {
        onLog('⚠️ Poll error (retrying): ' + err.message);
      }
    }

    await sleep(5000);
    attempt++;
  }

  throw new Error('Deployment timed out after 10 minutes. It may still be building — check dashboard.render.com');
}

/**
 * Full auto-deploy: create service + set env vars + trigger deploy + poll.
 * @param {string} apiKey - Render API key
 * @param {Object} config - { serviceType, name, repoUrl, branch, runtime, buildCommand, startCommand, plan, region, numInstances, disk, publishPath }
 * @param {Array} envVars - [{ key, value }]
 * @param {Function} onLog
 * @param {Function} onProgress
 * @returns {{ serviceId, serviceUrl, status }}
 */
export async function autoDeploy(apiKey, config, envVars, onLog, onProgress) {
  // 1. Get owner
  onLog('🔑 Authenticating with Render API...');
  var owner = await getOwner(apiKey);
  onLog('✓ Authenticated as ' + (owner.name || owner.email || owner.id));
  onProgress(48);

  // 2. Create service
  onLog('🟣 Creating Render service "' + config.name + '"...');
  config.ownerId = owner.id;
  var service = await createService(apiKey, config);
  var serviceId = service.id;
  onLog('✅ Service created: ' + (service.name || config.name) + ' (' + serviceId + ')');
  onProgress(52);

  // 3. Set env vars (before first deploy completes)
  if (envVars && envVars.length > 0) {
    var validVars = envVars.filter(function (v) { return v && v.key && v.key.trim(); });
    if (validVars.length > 0) {
      onLog('🔑 Setting ' + validVars.length + ' environment variable(s)...');
      try {
        await setEnvVars(apiKey, serviceId, validVars);
        onLog('✓ Environment variables set');
      } catch (err) {
        onLog('⚠️ Env vars warning: ' + err.message + ' (deploy will continue)');
      }
    }
  }

  // 4. Trigger a fresh deploy (to pick up env vars)
  onLog('🚀 Triggering deployment...');
  try {
    await triggerDeploy(apiKey, serviceId);
  } catch (err) {
    onLog('⚠️ Trigger deploy note: ' + err.message + ' (auto-deploy may already be running)');
  }
  onProgress(55);

  // 5. Poll until live
  onLog('⏳ Waiting for Render to build and deploy...');
  var result = await pollUntilLive(apiKey, serviceId, onLog, onProgress);

  return {
    serviceId: serviceId,
    serviceUrl: result.serviceUrl || ('https://' + config.name + '.onrender.com'),
    status: result.status,
  };
}
