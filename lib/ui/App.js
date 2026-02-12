// ProtoForge Terminal UI
// Inspired by OpenClaw's clean, functional TUI design

import React from 'react';
import { Box, Text, useInput, useApp, Spacer } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import open from 'open';
import { generatePrototype } from '../core/generator.js';
import { getAIConfig, getConfigValue, setConfigValue, getProviderAuth, getAvailableProviders } from '../core/config.js';
import { startWebServer } from '../web/server.js';

// Tab definitions
const TABS = [
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'generate', label: 'Generate', icon: '⚡' },
  { id: 'config', label: 'Config', icon: '⚙️' },
  { id: 'help', label: 'Help', icon: '?' }
];

function StatusBar({ provider, model, state }) {
  const stateColors = {
    idle: chalk.dim,
    running: chalk.yellow,
    done: chalk.green,
    error: chalk.red
  };
  
  return (
    <Box marginTop={1} paddingTop={1} borderTop="double" borderColor="gray">
      <Text>{chalk.dim(`Provider: ${provider}`)}</Text>
      <Spacer />
      <Text>{chalk.dim(`Model: ${model}`)}</Text>
      <Spacer />
      <Text>{stateColors[state](state.toUpperCase())}</Text>
    </Box>
  );
}

function ProjectList({ projects, onSelect }) {
  if (!projects || projects.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">No projects yet. Go to Generate to create one.</Text>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" padding={1}>
      {projects.map((project, idx) => (
        <Box key={project.path || idx} marginBottom={1}>
          <Text color="cyan">▸ </Text>
          <Text
            color="blue"
            underline
            onClick={() => onSelect(project)}
          >
            {project.name}
          </Text>
          <Text dimColor> ({project.type})</Text>
        </Box>
      ))}
    </Box>
  );
}

function HelpPanel() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="white" bold>Keyboard Shortcuts:</Text>
      <Box marginTop={1} flexDirection="column">
        <Text><Text bold>↑/↓</Text> Navigate history</Text>
        <Text><Text bold>Tab</Text> Switch panels</Text>
        <Text><Text bold>Enter</Text> Run generation</Text>
        <Text><Text bold>W</Text> Open web interface</Text>
        <Text><Text bold>Ctrl+C</Text> Quit</Text>
      </Box>
      
      <Box marginTop={2}>
        <Text color="white" bold>Commands:</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text><Text bold>/model</Text> Switch AI model</Text>
        <Text><Text bold>/config</Text> Open config editor</Text>
        <Text><Text bold>/clear</Text> Clear log</Text>
      </Box>
    </Box>
  );
}

function ConfigPanel() {
  const ai = getAIConfig();
  const auth = getProviderAuth(ai.primaryProvider);
  const providers = getAvailableProviders();
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="white" bold>AI Configuration:</Text>
      
      <Box marginTop={1} flexDirection="column">
        <Text>Provider: <Text color="cyan">{ai.primaryProvider}</Text></Text>
        <Text>Model: <Text color="cyan">{ai.primaryModel}</Text></Text>
        <Text>Temperature: <Text color="cyan">{ai.temperature}</Text></Text>
        <Text>Max Tokens: <Text color="cyan">{ai.maxTokens}</Text></Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Auth: </Text>
        {auth.hasAuth ? (
          <Text color="green">[CONFIGURED]</Text>
        ) : (
          <Text color="yellow">[NOT SET - Use {auth.apiKeyEnv || 'environment'}]</Text>
        )}
      </Box>
      
      <Box marginTop={2}>
        <Text color="white" bold>Available Providers:</Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        {providers.map(p => (
          <Text key={p.id} color={p.id === ai.primaryProvider ? 'green' : 'gray'}>
            • {p.name}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

export default function App() {
  const { exit } = useApp();
  
  const [tabIndex, setTabIndex] = React.useState(1); // Start on Generate tab
  const [prompt, setPrompt] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [logLines, setLogLines] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [lastOutputDir, setLastOutputDir] = React.useState(getConfigValue('lastProject', ''));
  
  const ai = getAIConfig();
  
  const appendLog = React.useCallback((line, color = 'white') => {
    setLogLines(prev => {
      const next = [...prev, { text: line, color }];
      return next.slice(-100); // Keep last 100 lines
    });
  }, []);
  
  const run = React.useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    
    setStatus('running');
    setHistory(prev => [text, ...prev].slice(0, 50));
    setHistoryIndex(-1);
    setPrompt('');
    appendLog(`> ${text}`, 'yellow');
    
    const tuiLogger = {
      info: (m) => appendLog(String(m), 'gray'),
      success: (m) => appendLog(String(m), 'green'),
      warn: (m) => appendLog(String(m), 'yellow'),
      error: (m) => appendLog(String(m), 'red'),
      debug: () => {},
      banner: () => {},
      header: () => {}
    };
    
    try {
      const res = await generatePrototype(text, {
        projectType: 'hybrid',
        stream: false,
        logger: tuiLogger,
        onToken: () => {}
      });
      
      setLastOutputDir(res.projectDir);
      setStatus('done');
      appendLog(`✓ Generated: ${res.projectDir}`, 'green');
      appendLog('Press W to open web dashboard', 'dim');
    } catch (e) {
      setStatus('error');
      appendLog(`Error: ${e.message}`, 'red');
    }
  }, [prompt, appendLog]);
  
  const openWeb = React.useCallback(async () => {
    const port = getConfigValue('webPort', 3000);
    appendLog(`Starting web server on port ${port}...`, 'dim');
    try {
      await startWebServer(port);
      await open(`http://localhost:${port}`);
    } catch (e) {
      appendLog(`Web error: ${e.message}`, 'red');
    }
  }, [appendLog]);
  
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    
    if (key.tab) {
      setTabIndex(i => (i + 1) % TABS.length);
      return;
    }
    
    if (input === 'w' || input === 'W') {
      openWeb();
      return;
    }
    
    if (key.escape) {
      setPrompt('');
      setHistoryIndex(-1);
      return;
    }
    
    if (key.upArrow && history.length) {
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setPrompt(history[next] || '');
      return;
    }
    
    if (key.downArrow && history.length) {
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setPrompt(next === -1 ? '' : history[next] || '');
      return;
    }
    
    if (key.return) {
      if (!status || status === 'idle') {
        run();
      }
      return;
    }
  });
  
  const panelWidth = 0.35;
  
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box>
        <Text color="cyan" bold>ProtoForge</Text>
        <Spacer />
        <Text dimColor>v1.0</Text>
      </Box>
      
      {/* Tab Bar */}
      <Box marginTop={1}>
        {TABS.map((tab, idx) => (
          <Text key={tab.id} color={tabIndex === idx ? 'cyan' : 'gray'}>
            {tabIndex === idx ? '▸ ' : '  '}
            {tab.icon} {tab.label}
            {idx < TABS.length - 1 ? '  ' : ''}
          </Text>
        ))}
      </Box>
      
      {/* Main Content */}
      <Box flexDirection="row" marginTop={1} flexGrow={1}>
        {/* Left: Tab Content */}
        <Box width={`${Math.floor(panelWidth * 100)}%`} flexDirection="column" marginRight={1}>
          {tabIndex === 0 && <ProjectList projects={[]} onSelect={() => {}} />}
          {tabIndex === 1 && (
            <Box flexDirection="column">
              <Box borderStyle="round" borderColor="gray" padding={1} flexDirection="column">
                <Text dimColor>Describe what to build:</Text>
                <TextInput 
                  value={prompt} 
                  onChange={setPrompt} 
                  placeholder="e.g., A smart plant monitor with moisture sensor..."
                />
              </Box>
              
              <Box marginTop={1}>
                <Text dimColor>Type: </Text>
                <Text color="cyan">Hybrid</Text>
                <Text dimColor> | Provider: </Text>
                <Text color="cyan">{ai.primaryProvider}</Text>
                <Text dimColor> | Model: </Text>
                <Text color="cyan">{ai.primaryModel}</Text>
              </Box>
              
              <Box marginTop={1}>
                <Text bold color={status === 'idle' ? 'gray' : status === 'running' ? 'yellow' : status === 'done' ? 'green' : 'red'}>
                  [{status.toUpperCase()}]
                </Text>
                <Spacer />
                <Text dimColor>Enter to run | ↑↓ history | W web</Text>
              </Box>
            </Box>
          )}
          {tabIndex === 2 && <ConfigPanel />}
          {tabIndex === 3 && <HelpPanel />}
        </Box>
        
        {/* Right: Log Output */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray">
          <Box paddingX={1} paddingY={0}>
            <Text dimColor>Output Log</Text>
          </Box>
          <Box flexDirection="column" paddingX={1} paddingY={0} flexGrow={1}>
            {logLines.slice(-20).map((line, idx) => (
              <Text key={idx} color={line.color}>{line.text}</Text>
            ))}
          </Box>
        </Box>
      </Box>
      
      {/* Footer */}
      <StatusBar 
        provider={ai.primaryProvider} 
        model={ai.primaryModel} 
        state={status}
      />
    </Box>
  );
}
