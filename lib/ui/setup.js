/**
 * Setup Wizard Module
 * Interactive setup wizard for configuring AI providers and integrations
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  ensureConfigDir,
  getAIConfig,
  getAvailableProviders,
  setAIConfig,
  getConfigValue,
  setConfigValue
} from '../core/config.js';

/**
 * Run the setup wizard
 */
export async function setupWizard() {
  await ensureConfigDir();

  console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.white('         ProtoForge Setup Wizard') + chalk.cyan('                       ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝\n'));

  try {
    const providers = getAvailableProviders();
    const current = getAIConfig();

    // 1) Provider (default Ollama)
    const step1 = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'AI provider (default: Ollama — local & free):',
        choices: providers
          .filter((p) => p.id !== 'mock')
          .map((p) => ({ name: p.name, value: p.id })),
        default: current.provider || 'ollama'
      }
    ]);

    // 2) Ollama URL + model (always asked; Ollama is the recommended baseline)
    const step2 = await inquirer.prompt([
      {
        type: 'input',
        name: 'ollamaUrl',
        message: 'Ollama URL:',
        default: getConfigValue('baseUrl', 'http://localhost:11434')
      },
      {
        type: 'input',
        name: 'ollamaModel',
        message: 'Ollama model:',
        default: getConfigValue('model', 'llama3.1')
      }
    ]);

    // 3) Optional cloud key (OpenAI or Groq)
    const step3 = await inquirer.prompt([
      {
        type: 'list',
        name: 'cloudProvider',
        message: 'Optional cloud AI provider (free tier keys supported):',
        choices: [
          { name: 'None', value: 'none' },
          { name: 'OpenAI', value: 'openai' },
          { name: 'Groq', value: 'groq' }
        ],
        default: getConfigValue('cloudProvider', 'none')
      },
      {
        type: 'password',
        name: 'cloudApiKey',
        message: 'Cloud API key (stored locally in ~/.protoforge/config.json):',
        when: (a) => a.cloudProvider && a.cloudProvider !== 'none',
        default: () => getConfigValue('cloudApiKey', ''),
        validate: (v) => (v && v.length ? true : 'Key required for selected cloud provider')
      }
    ]);

    // 4) Optional Meshy key
    const step4 = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useMeshy',
        message: 'Optional: add Meshy API key for 3D models? (Meshy has a free tier)',
        default: Boolean(getConfigValue('meshyApiKey', ''))
      },
      {
        type: 'password',
        name: 'meshyApiKey',
        message: 'Meshy API key (stored locally):',
        when: (a) => a.useMeshy === true,
        default: () => getConfigValue('meshyApiKey', ''),
        validate: (v) => (v && v.length ? true : 'Meshy key required if enabled')
      }
    ]);

    // 5) Other free APIs
    console.log(chalk.dim('\nNotes: Mermaid diagrams require no API key.'));

    // Save config
    // Keep Ollama settings stored even if primary provider is cloud.
    setConfigValue('baseUrl', step2.ollamaUrl);
    setConfigValue('model', step2.ollamaModel);

    // Save optional cloud + meshy
    setConfigValue('cloudProvider', step3.cloudProvider);
    if (step3.cloudProvider !== 'none') setConfigValue('cloudApiKey', step3.cloudApiKey);
    if (step3.cloudProvider === 'none') setConfigValue('cloudApiKey', '');

    setConfigValue('meshyApiKey', step4.useMeshy ? step4.meshyApiKey : '');

    // Primary provider selection
    // If they chose a provider that needs a key but none is stored, fall back to Ollama.
    let provider = step1.provider;
    let apiKey = '';

    if (provider === 'openai' || provider === 'groq') {
      apiKey = step3.cloudProvider === provider ? step3.cloudApiKey : '';
      if (!apiKey) {
        console.log(chalk.yellow(`\nNo ${provider} key provided — switching primary provider to Ollama.`));
        provider = 'ollama';
      }
    }

    setAIConfig({
      provider,
      baseUrl: step2.ollamaUrl,
      model: step2.ollamaModel,
      apiKey
    });

    const step5 = await inquirer.prompt([
      {
        type: 'input',
        name: 'outputDir',
        message: 'Output directory for generated projects:',
        default: getConfigValue('outputDir', './protoforge-output')
      },
      {
        type: 'confirm',
        name: 'autoOpenWeb',
        message: 'Auto-open web browser when starting the web UI?',
        default: getConfigValue('autoOpenWeb', false)
      },
      {
        type: 'input',
        name: 'webPort',
        message: 'Web UI port:',
        default: String(getConfigValue('webPort', 3000)),
        filter: (v) => Number(v)
      }
    ]);

    setConfigValue('outputDir', step5.outputDir);
    setConfigValue('autoOpenWeb', step5.autoOpenWeb);
    setConfigValue('webPort', step5.webPort);

    console.log('\n' + chalk.green('✓ Setup complete'));
    console.log(chalk.dim('Next:'));
    console.log(`  • ${chalk.cyan('Run protoforge start')} to open the terminal chat interface`);
    console.log(`  • ${chalk.cyan('Run protoforge web')} to open the web dashboard at ${chalk.cyan(`http://localhost:${step5.webPort}`)}`);
    console.log(chalk.dim('Tip: Use the web version to edit projects, view code, diagrams, 3D models, BOM, and the build guide.'));
  } catch (error) {
    if (error?.isTtyError) {
      console.log(chalk.yellow('\nInteractive prompts not supported in this environment.'));
      console.log(chalk.dim('You can configure manually via: protoforge config --set key=value'));
      return;
    }
    throw error;
  }
}

export default { setupWizard };
