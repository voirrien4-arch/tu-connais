// services/render-service.js — Generate render.yaml Blueprint for Render deploy
// Maps project types to correct Render service types per the official Blueprint spec.
//
// Service type mapping:
//   bot    → worker (background process, no public URL, no port)
//   api    → web (listens on port, gets .onrender.com URL)
//   site   → static_site (pure HTML/CSS) or web (SSR like Next.js)
//   docker → web with runtime: docker
//
// IMPORTANT: Render discontinued free Web/Worker services in 2024.
// - web/worker → minimum plan is "starter" ($7/mo)
// - static_site → plan "free" is still available
// A credit card is required on Render for any non-free service.

function getRenderServiceType(projectType, detectedType, runtime, serviceTypeOverride) {
  // User explicitly chose a service type in the options UI
  if (serviceTypeOverride && serviceTypeOverride !== 'auto' && serviceTypeOverride !== '') return serviceTypeOverride;
  var type = projectType || detectedType;
  if (type === 'bot') return 'worker';
  if (type === 'site' && runtime === 'static') return 'static_site';
  if (type === 'site') return 'web';
  return 'web';
}

function mapRuntime(runtime) {
  var map = { node: 'node', python: 'python', go: 'go', ruby: 'ruby', rust: 'rust', docker: 'docker' };
  return map[runtime] || 'node';
}

function escapeDoubleQuotes(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate render.yaml Blueprint content.
 */
export function generateRenderYaml(config) {
  var projectName = config.projectName || 'project';
  var runtime = config.runtime || 'node';
  var buildCommand = config.buildCommand !== undefined && config.buildCommand !== null ? config.buildCommand : 'npm install';
  var startCommand = config.startCommand !== undefined && config.startCommand !== null ? config.startCommand : 'npm start';
  var detectedType = config.detectedType || null;
  var projectType = config.projectType || 'bot';
  var envVars = config.envVars || [];
  var renderOptions = config.renderOptions || {};

  var serviceType = getRenderServiceType(projectType, detectedType, runtime, renderOptions.serviceType);

  // Default options — plan defaults based on service type
  var defaultPlan = serviceType === 'static_site' ? 'free' : 'starter';
  var opts = {
    region: 'oregon',
    plan: defaultPlan,
    autoDeploy: true,
    numInstances: 1,
    healthCheckPath: '',
    staticPublishPath: 'disk',
    disk: null,
  };

  // Merge user options
  Object.keys(renderOptions).forEach(function (k) {
    var v = renderOptions[k];
    if (v !== undefined && v !== '' && v !== null) opts[k] = v;
  });

  // Safety: if user selected "free" for web/worker, upgrade to starter
  if (opts.plan === 'free' && serviceType !== 'static_site') {
    opts.plan = 'starter';
  }
  // Static sites are always free on Render — force it
  if (serviceType === 'static_site') {
    opts.plan = 'free';
  }

  var lines = [];

  // Top-level services array
  lines.push('services:');

  // Service list item
  lines.push('  - type: ' + serviceType);
  lines.push('    name: ' + yamlSafe(projectName));

  // Runtime (not for static_site)
  if (serviceType !== 'static_site') {
    if (runtime === 'docker') {
      lines.push('    runtime: docker');
      lines.push('    dockerfilePath: ./Dockerfile');
    } else {
      lines.push('    runtime: ' + mapRuntime(runtime));
    }
  }

  // Build command
  if (serviceType === 'static_site') {
    if (buildCommand && buildCommand !== 'npm install') {
      lines.push('    buildCommand: ' + yamlScalar(buildCommand));
      lines.push('    staticPublishPath: ' + yamlScalar(opts.staticPublishPath || 'disk'));
    } else {
      lines.push('    staticPublishPath: ' + yamlScalar(opts.staticPublishPath || '.'));
    }
  } else {
    if (buildCommand) {
      lines.push('    buildCommand: ' + yamlScalar(buildCommand));
    }
    if (startCommand) {
      lines.push('    startCommand: ' + yamlScalar(startCommand));
    }
  }

  // Plan — always include explicitly
  lines.push('    plan: ' + opts.plan);

  // Region — only if different from default
  if (opts.region && opts.region !== 'oregon') {
    lines.push('    region: ' + opts.region);
  }

  // Auto deploy — only if false (true is default)
  if (opts.autoDeploy === false) {
    lines.push('    autoDeploy: false');
  }

  // Num instances — only if > 1
  if (opts.numInstances && opts.numInstances > 1) {
    lines.push('    numInstances: ' + opts.numInstances);
  }

  // Health check — web services only
  if (serviceType === 'web' && opts.healthCheckPath && opts.healthCheckPath.trim()) {
    lines.push('    healthCheckPath: ' + yamlScalar(opts.healthCheckPath.trim()));
  }

  // Persistent disk
  var diskConfig = opts.disk;
  if (!diskConfig && opts.diskEnabled) {
    diskConfig = { enabled: true, name: 'data', mountPath: opts.diskPath || '/data', sizeGB: opts.diskSize || 1 };
  }
  if (diskConfig && diskConfig.enabled) {
    lines.push('    disk:');
    lines.push('      name: ' + yamlScalar(diskConfig.name || 'data'));
    lines.push('      mountPath: ' + yamlScalar(diskConfig.mountPath || '/data'));
    lines.push('      sizeGB: ' + (parseInt(diskConfig.sizeGB) || 1));
  }

  // Environment variables — always quote values
  var validEnvs = envVars.filter(function (v) { return v && v.key && v.key.trim() && v.value; });
  if (validEnvs.length > 0) {
    lines.push('    envVars:');
    for (var i = 0; i < validEnvs.length; i++) {
      lines.push('      - key: ' + yamlSafeKey(validEnvs[i].key));
      lines.push('        value: ' + yamlScalar(validEnvs[i].value));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Format a value as a YAML scalar — always wraps in double quotes to be safe.
 */
function yamlScalar(val) {
  if (val === undefined || val === null || val === '') return '""';
  return '"' + escapeDoubleQuotes(val).replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
}

/**
 * Make a project name safe for YAML
 */
function yamlSafe(name) {
  if (!name) return '"project"';
  var str = String(name);
  if (/[^a-zA-Z0-9_-]/.test(str) || /^\s|\s$/.test(str)) {
    return '"' + escapeDoubleQuotes(str) + '"';
  }
  return str;
}

/**
 * Ensure env var key is safe for YAML (alphanumeric + underscore only)
 */
function yamlSafeKey(key) {
  return String(key || '').replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Validate a Render API key (format check only — CORS blocks actual validation)
 */
export async function validateRenderKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    throw new Error('API key is too short. Generate one at render.com/account/api-keys');
  }
  return { ownerId: 'unknown', note: 'Render API cannot be validated from browser (no CORS). Key format accepted.' };
}

/**
 * Get the Render one-click deploy URL for a GitHub repo
 */
export function getRenderDeployUrl(repoUrl) {
  return 'https://render.com/deploy?repo=' + encodeURIComponent(repoUrl);
}
