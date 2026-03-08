/**
 * n8n-Compatible Frontend Settings
 *
 * Generates a stubbed FrontendSettings response that matches the shape
 * n8n's editor-ui expects from GET /rest/settings.
 *
 * Key: previewMode is set to true, which tells the editor to bypass
 * auth flows, skip user initialization, and run in a simplified mode.
 */

export function generateFrontendSettings() {
  return {
    // CRITICAL FLAGS
    previewMode: true, // Bypasses auth, skips user init in editor
    inE2ETests: false,
    isDocker: false,

    // Database
    databaseType: 'postgresdb',

    // Endpoints
    endpointForm: 'form',
    endpointFormTest: 'form-test',
    endpointFormWaiting: 'form-waiting',
    endpointMcp: 'mcp',
    endpointWebhook: 'webhook',
    endpointWebhookTest: 'webhook-test',
    endpointWebhookWaiting: 'webhook-waiting',

    // Save settings
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    saveManualExecutions: true,
    saveDataProgressExecution: false,

    // Execution
    executionTimeout: -1,
    maxExecutionTimeout: 3600,
    workflowCallerPolicyDefaultOption: 'workflowsFromSameOwner',

    // Timezone
    timezone: 'America/Los_Angeles',

    // URLs
    urlBaseWebhook: 'http://localhost:3100/webhook/',
    urlBaseEditor: 'http://localhost:4200/',

    // Version
    versionCli: '2.11.0',
    releaseChannel: 'stable',

    // Instance
    instanceId: 'r360-flow-instance',

    // Telemetry -- all disabled
    telemetry: { enabled: false },
    posthog: {
      enabled: false,
      apiHost: '',
      apiKey: '',
      autocapture: false,
      disableSessionRecording: true,
      debug: false,
    },

    // i18n
    defaultLocale: 'en',

    // Templates
    templates: { enabled: false, host: '' },

    // Features -- all disabled
    workflowTagsDisabled: false,
    logLevel: 'info',
    hiringBannerEnabled: false,
    communityNodesEnabled: false,
    isNpmAvailable: false,

    // Auth
    authCookie: { enabled: false },
    publicApi: {
      enabled: false,
      latestVersion: 1,
      path: 'api',
      swaggerUi: { enabled: false },
    },

    // License/Enterprise
    license: {
      planName: 'Community',
      consumerId: 'r360-flow',
      environment: 'development',
    },
    enterprise: {
      sharing: false,
      ldap: false,
      saml: false,
      logStreaming: false,
      advancedExecutionFilters: false,
      variables: false,
      sourceControl: false,
      auditLogs: false,
      externalSecrets: false,
      showNonProdBanner: false,
      debugInEditor: false,
      binaryDataS3: false,
      workflowHistory: false,
      workerView: false,
      advancedPermissions: false,
      projects: false,
    },

    // Misc
    executionMode: 'regular',
    pushBackend: 'websocket',
    binaryDataMode: 'default',
    allowedModules: { builtIn: [], external: [] },

    // Folders
    folders: { enabled: false },

    // MFA
    mfa: { enabled: false },

    // Banner dismiss
    banners: { dismissed: [] },

    // AI
    ai: { enabled: false },

    // Variables
    variables: { limit: 0 },

    // Expressions
    expressions: { evaluator: 'tmpl' },

    // User management
    userManagement: {
      quota: -1,
      showSetupOnFirstLoad: false,
      smtpSetup: false,
      authenticationMethod: 'email',
    },

    // SSO
    sso: {
      saml: { loginEnabled: false, loginLabel: '' },
      ldap: { loginEnabled: false, loginLabel: '' },
    },

    // Active modules (empty)
    activeModules: [],
  };
}
