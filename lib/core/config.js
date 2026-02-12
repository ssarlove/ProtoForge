/**
 * ProtoForge Configuration Management
 * Inspired by OpenClaw's config system with hot-reload and env var substitution
 */

import Conf from 'conf';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Schema with validation
const schema = {
  // Core settings
  outputDir: { type: 'string', default: path.join(os.homedir(), 'protoforge-output') },
  webPort: { type: 'number', default: 3000 },
  autoOpenWeb: { type: 'boolean', default: false },
  
  // AI defaults (can be overridden per-agent)
  ai: {
    type: 'object',
    properties: {
      primaryProvider: { type: 'string', default: 'openai' },
      primaryModel: { type: 'string', default: 'gpt-4o-mini' },
      imageModel: { type: 'string', default: 'gpt-4o-mini' },
      
      // Fallbacks in order
      fallbacks: { 
        type: 'array', 
        items: { type: 'string' },
        default: ['anthropic/claude-sonnet-4-5', 'groq/llama-3.1-70b-versatile']
      },
      
      // Image model fallbacks
      imageFallbacks: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      
      // Temperature and token limits
      temperature: { type: 'number', default: 0.7 },
      maxTokens: { type: 'number', default: 8192 },
    },
    default: {}
  },
  
  // Provider configurations
  providers: {
    type: 'object',
    default: {
      openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
      anthropic: { enabled: true, baseUrl: 'https://api.anthropic.com' },
      groq: { enabled: true, baseUrl: 'https://api.groq.com/openai/v1' },
      gemini: { enabled: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
      deepseek: { enabled: true, baseUrl: 'https://api.deepseek.com' },
      ollama: { enabled: true, baseUrl: 'http://localhost:11434' },
    }
  },
  
  // Auth profiles (like OpenClaw)
  auth: {
    type: 'object',
    default: {
      profiles: {},
      defaultProfile: 'default'
    }
  },
  
  // Recent projects
  recentProjects: { type: 'array', items: { type: 'string' }, default: [] },
  lastProject: { type: 'string', default: '' },
  
  // UI preferences
  ui: {
    type: 'object',
    properties: {
      theme: { type: 'string', default: 'dark' },
      compactMode: { type: 'boolean', default: false },
      showAnimations: { type: 'boolean', default: true },
    },
    default: {}
  },
  
  // Custom providers
  customProviders: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        baseUrl: { type: 'string' },
        models: { type: 'array', items: { type: 'string' } },
        authType: { type: 'string', enum: ['apiKey', 'bearer', 'none'], default: 'apiKey' },
        apiKeyEnv: { type: 'string' },
      }
    },
    default: []
  },
  
  // Gateway settings
  gateway: {
    type: 'object',
    properties: {
      port: { type: 'number', default: 18789 },
      bind: { type: 'string', default: '127.0.0.1' },
      reloadMode: { type: 'string', enum: ['hybrid', 'hot', 'restart', 'off'], default: 'hybrid' },
    },
    default: {}
  },
};

// Create Conf instance with schema validation
const config = new Conf({
  projectName: 'protoforge',
  configName: 'config.json',
  cwd: path.join(os.homedir(), '.protoforge'),
  schema,
  fileMode: 0o600, // Restrict config file to owner only
});

/**
 * Config hot-reload watcher
 */
let watcher = null;

/**
 * Start watching config for changes (hot-reload mode)
 */
export function watchConfig(onChange) {
  if (watcher) return;
  
  const configPath = config.path;
  watcher = fs.watch(configPath, () => {
    const newConfig = config.store;
    if (onChange) onChange(newConfig);
  });
}

/**
 * Stop watching config
 */
export function unwatchConfig() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

/**
 * Get full config object
 */
export function getConfig() {
  return config.store;
}

/**
 * Get specific config value with env var substitution
 * Supports ${VAR_NAME} syntax like OpenClaw
 */
export function getConfigValue(key, defaultValue = null) {
  let value = config.get(key);
  
  // Env var substitution
  if (typeof value === 'string') {
    const matches = value.match(/\$\{([A-Z_][A-Z0-9_]*)\}/g);
    if (matches) {
      for (const match of matches) {
        const varName = match.slice(2, -1);
        const envValue = process.env[varName];
        if (envValue !== undefined) {
          value = value.replace(match, envValue);
        }
      }
    }
  }
  
  return value !== undefined ? value : defaultValue;
}

/**
 * Set config value
 */
export function setConfigValue(key, value) {
  config.set(key, value);
}

/**
 * Unset config value
 */
export function unsetConfigValue(key) {
  config.delete(key);
}

/**
 * Reset all config to defaults
 */
export function resetConfig() {
  config.clear();
}

/**
 * Export config to JSON file
 */
export async function exportConfig(filePath = null) {
  const exportPath = filePath || path.join(os.homedir(), 'protoforge-config-export.json');
  await fs.writeJson(exportPath, config.store, { spaces: 2 });
  return exportPath;
}

/**
 * Import config from JSON file
 */
export async function importConfig(filePath) {
  const imported = await fs.readJson(filePath);
  Object.entries(imported).forEach(([key, value]) => {
    config.set(key, value);
  });
}

/**
 * Get AI configuration (resolved, with env vars)
 */
export function getAIConfig() {
  const ai = getConfigValue('ai', {});
  const providers = getConfigValue('providers', {});
  
  return {
    primaryProvider: ai.primaryProvider || 'openai',
    primaryModel: ai.primaryModel || 'gpt-4o-mini',
    imageModel: ai.imageModel || 'gpt-4o-mini',
    fallbacks: ai.fallbacks || [],
    imageFallbacks: ai.imageFallbacks || [],
    temperature: ai.temperature ?? 0.7,
    maxTokens: ai.maxTokens ?? 8192,
    providers,
  };
}

/**
 * Set AI configuration
 */
export function setAIConfig(aiConfig) {
  const current = getConfigValue('ai', {});
  if (aiConfig.primaryProvider) current.primaryProvider = aiConfig.primaryProvider;
  if (aiConfig.primaryModel) current.primaryModel = aiConfig.primaryModel;
  if (aiConfig.imageModel) current.imageModel = aiConfig.imageModel;
  if (aiConfig.fallbacks) current.fallbacks = aiConfig.fallbacks;
  if (aiConfig.imageFallbacks) current.imageFallbacks = aiConfig.imageFallbacks;
  if (aiConfig.temperature !== undefined) current.temperature = aiConfig.temperature;
  if (aiConfig.maxTokens) current.maxTokens = aiConfig.maxTokens;
  setConfigValue('ai', current);
}

/**
 * Get provider auth credentials (like OpenClaw auth profiles)
 */
export function getProviderAuth(provider) {
  const auth = getConfigValue('auth', {});
  const profiles = auth.profiles || {};
  const defaultProfile = auth.defaultProfile || 'default';
  
  // Check default profile first
  const profile = profiles[defaultProfile] || {};
  
  // Provider-specific env var mapping
  const envMap = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  
  const apiKeyEnv = envMap[provider.toLowerCase()] || '';
  const apiKey = (apiKeyEnv && process.env[apiKeyEnv]) || profile[`${provider}_api_key`] || '';
  
  return {
    apiKey,
    apiKeyEnv,
    profile,
    hasAuth: !!apiKey,
  };
}

/**
 * Set provider auth in profile
 */
export function setProviderAuth(provider, apiKey) {
  const auth = getConfigValue('auth', {});
  const profiles = auth.profiles || {};
  const defaultProfile = auth.defaultProfile || 'default';
  
  if (!profiles[defaultProfile]) profiles[defaultProfile] = {};
  profiles[defaultProfile][`${provider}_api_key`] = apiKey;
  
  auth.profiles = profiles;
  setConfigValue('auth', auth);
}

/**
 * Get available providers with metadata
 */
export function getAvailableProviders() {
  return [
    { 
      id: 'openai', 
      name: 'OpenAI', 
      requiresKey: true, 
      defaultModel: 'gpt-4o-mini',
      envKey: 'OPENAI_API_KEY',
      baseUrl: 'https://api.openai.com/v1'
    },
    { 
      id: 'anthropic', 
      name: 'Anthropic Claude', 
      requiresKey: true, 
      defaultModel: 'claude-sonnet-4-5',
      envKey: 'ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com'
    },
    { 
      id: 'groq', 
      name: 'Groq', 
      requiresKey: true, 
      defaultModel: 'llama-3.1-70b-versatile',
      envKey: 'GROQ_API_KEY',
      baseUrl: 'https://api.groq.com/openai/v1'
    },
    { 
      id: 'gemini', 
      name: 'Google Gemini', 
      requiresKey: true, 
      defaultModel: 'gemini-1.5-flash',
      envKey: 'GEMINI_API_KEY',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
    },
    { 
      id: 'deepseek', 
      name: 'DeepSeek', 
      requiresKey: true, 
      defaultModel: 'deepseek-chat',
      envKey: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com'
    },
    { 
      id: 'ollama', 
      name: 'Ollama', 
      requiresKey: false, 
      defaultModel: 'llama3.1',
      defaultUrl: 'http://localhost:11434'
    },
  ];
}

/**
 * Interactive setup wizard (like OpenClaw's onboard)
 */
export async function runSetupWizard() {
  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.white('         ProtoForge Setup Wizard') + chalk.cyan('                     ║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝\n'));
  
  const providers = getAvailableProviders();
  const providerChoices = providers.map(p => ({
    name: `${p.name} ${p.requiresKey ? '(requires API key)' : ''}`,
    value: p.id,
    short: p.name
  }));
  
  // Step 1: Select primary provider
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your AI provider:',
      choices: providerChoices,
      default: 'openai'
    }
  ]);
  
  // Step 2: API key (if needed)
  let apiKey = '';
  const selectedProvider = providers.find(p => p.id === provider);
  
  if (selectedProvider.requiresKey) {
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: `Enter ${selectedProvider.name} API key (or press Enter to use ${selectedProvider.envKey} env var):`,
        mask: '*'
      }
    ]);
    apiKey = key;
    
    if (apiKey) {
      setProviderAuth(provider, apiKey);
      console.log(chalk.green(`✓ API key saved securely`));
    } else {
      console.log(chalk.dim(`  Using ${selectedProvider.envKey} from environment`));
    }
  }
  
  // Step 3: Select model
  const modelMap = {
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
    anthropic: ['claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-3-5'],
    groq: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
    deepseek: ['deepseek-chat'],
    ollama: ['llama3.1', 'llama3', 'mistral', 'codellama']
  };
  
  const models = modelMap[provider] || [selectedProvider.defaultModel];
  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Select model:',
      choices: models.map(m => ({ name: m, value: m })),
      default: models[0]
    }
  ]);
  
  // Step 4: Output directory
  const { outputDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputDir',
      message: 'Output directory for generated projects:',
      default: path.join(os.homedir(), 'protoforge-output'),
      filter: (input) => path.resolve(input)
    }
  ]);
  
  // Step 5: Web port
  const { webPort } = await inquirer.prompt([
    {
      type: 'input',
      name: 'webPort',
      message: 'Web interface port:',
      default: '3000',
      validate: (input) => !isNaN(parseInt(input)) || 'Must be a number'
    }
  ]);
  
  // Apply settings
  setAIConfig({
    primaryProvider: provider,
    primaryModel: model,
  });
  
  setConfigValue('outputDir', outputDir);
  setConfigValue('webPort', parseInt(webPort));
  
  console.log(chalk.green('\n✓ Setup complete!'));
  console.log(chalk.dim('  Run: protoforge web'));
  console.log(chalk.dim('  Config saved to: ') + config.path + '\n');
  
  return {
    provider,
    model,
    outputDir,
    webPort: parseInt(webPort)
  };
}

/**
 * Display current configuration status (like OpenClaw's models status)
 */
export function printConfigStatus() {
  const config = getConfig();
  const ai = getAIConfig();
  const auth = getProviderAuth(ai.primaryProvider);
  
  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.white('              ProtoForge Configuration') + chalk.cyan('              ║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝\n'));
  
  console.log(chalk.white('AI Settings:'));
  console.log(chalk.dim('  Provider:   ') + ai.primaryProvider);
  console.log(chalk.dim('  Model:      ') + ai.primaryModel);
  console.log(chalk.dim('  Temperature:') + ai.temperature);
  console.log(chalk.dim('  Max Tokens: ') + ai.maxTokens);
  
  console.log(chalk.white('\nAuth Status:'));
  console.log(chalk.dim('  Provider:   ') + ai.primaryProvider);
  console.log(chalk.dim('  API Key:    ') + (auth.hasAuth ? chalk.green('[SET]') : chalk.yellow('[NOT SET]')));
  if (auth.apiKeyEnv) {
    console.log(chalk.dim('  Env Var:    ') + auth.apiKeyEnv);
  }
  
  console.log(chalk.white('\nPaths:'));
  console.log(chalk.dim('  Output:     ') + config.outputDir);
  console.log(chalk.dim('  Web Port:   ') + config.webPort);
  console.log(chalk.dim('  Config:     ') + require('path').join(os.homedir(), '.protoforge', 'config.json'));
  
  console.log('');
}

/**
 * Ensure config directory exists
 */
export async function ensureConfigDir() {
  const dir = path.dirname(config.path);
  await fs.ensureDir(dir);
  return dir;
}

// Export config instance
export default config;
