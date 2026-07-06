// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalize multi-line commands by removing backslashes and joining lines.
 * Handles commands like:
 *   python main.py \
 *     --arg1 xxx \
 *     --arg2 xxx
 */
function normalizeMultilineCommand(input: string): string {
    const lines = input.split(/\r?\n/);
    const normalized: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // Remove trailing backslash (line continuation character)
        let processed = trimmed;
        if (processed.endsWith('\\')) {
            processed = processed.slice(0, -1).trim();
            // Skip empty lines after backslash removal
            if (processed.length === 0) {
                continue;
            }
        }
        // Only add non-empty lines
        if (processed.length > 0) {
            normalized.push(processed);
        }
    }

    // Join lines with single space
    return normalized.join(' ');
}

/**
 * Split input into env vars, python command, and remaining arguments.
 * Handles Python commands like: python, python3, .venv/bin/python, /usr/bin/python3.9, etc.
 */
function splitPythonCommand(input: string): { env: string; pythonCmd: string; remaining: string } {
    // Match: any path ending with 'python' or 'python<version>' followed by space
    // Matches: python, python3, .venv/bin/python, /opt/conda/bin/python3.9, ./python, etc.
    const pythonPattern = /((?:\S*\/|\.\/)?python(?:\d*(?:\.\d+)?)?)\s+/;

    const match = input.match(pythonPattern);

    if (!match || !match[1] || match.index === undefined) {
        return { env: '', pythonCmd: '', remaining: input };
    }

    const pythonCmd = match[1];
    const splitIndex = match.index + match[0].length;
    const env = input.substring(0, match.index).trim();
    const remaining = input.substring(splitIndex);

    return { env, pythonCmd, remaining };
}

/**
 * Parse command arguments respecting quotes.
 * Handles quoted arguments like: --arg "value with spaces"
 */
function parseArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];

        if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
            if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar) {
                inQuote = false;
                quoteChar = '';
            } else {
                current += char;
            }
        } else if (char === ' ' && !inQuote) {
            if (current.length > 0) {
                // Trim any trailing backslash that might have slipped through
                let finalArg = current;
                if (finalArg.endsWith('\\')) {
                    finalArg = finalArg.slice(0, -1);
                }
                // Only add non-empty arguments
                if (finalArg.length > 0) {
                    args.push(finalArg);
                }
                current = '';
            }
        } else {
            current += char;
        }
    }

    // Handle the last argument
    if (current.length > 0) {
        let finalArg = current;
        if (finalArg.endsWith('\\')) {
            finalArg = finalArg.slice(0, -1);
        }
        // Only add non-empty arguments
        if (finalArg.length > 0) {
            args.push(finalArg);
        }
    }

    return args;
}

function selectTaskName(editor: vscode.TextEditor, startLine: number, filenameLen: number) {
    const selection = new vscode.Selection(
        new vscode.Position(startLine + 1, 21),
        new vscode.Position(startLine + 1, 21 + filenameLen)
    );
    editor.selection = selection;
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
}

async function showTextInVirtualFile(out: string, filenameLen: number) {
    const doc = await vscode.workspace.openTextDocument({
        content: out,
        language: 'json'
    });
    const editor = await vscode.window.showTextDocument(doc,
        // {preview: true}
    );
    selectTaskName(editor, 0, filenameLen);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    // console.log('Congratulations, your extension "python-command-parser" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('python-command-parser.parse_python', async () => {

        const input = await vscode.window.showInputBox({
            prompt: 'Please input python command',
        });

        if (input) {
            // Step 1: Normalize multi-line commands (handle backslash continuations)
            const normalizedInput = normalizeMultilineCommand(input.trim());

            // Step 2: Split into env vars, python command, and remaining arguments
            const { env: oriEnv, pythonCmd, remaining: pythonArgs } = splitPythonCommand(normalizedInput);

            if (!pythonCmd) {
                vscode.window.showErrorMessage('Unable to find Python command in input! Expected format: python <script> or <path>/python <script>');
                return;
            }

            let envStr = '';
            if (oriEnv) {
                // Process environment variables
                envStr += '            "env": {\n';
                const envs = oriEnv.trim().split(' ');
                for (const env of envs) {
                    const [k, v] = env.split('=');
                    envStr += '                "' + k + '": ';
                    envStr += '"' + v + '",\n';
                }
                envStr += '            },\n';
                console.log(envStr);
            }

            // Step 3: Parse arguments with quote support
            const params = parseArguments(pythonArgs);
            if (params.length === 0) {
                vscode.window.showErrorMessage('No Python script specified after python command!');
                return;
            }
            const filenameLen = params[0].length;
            const program = `            "program": "${params[0]}",\n`;
            let args = '';
            if (params.length > 1) {
                // extra params
                args += '            "args": [\n';
                for (const p of params.slice(1)) {
                    args += `                "${p}",\n`;
                }
                args += '            ],\n';
            }
            // set name, if nothing entered, directly use name of the python file as name
            const out = `        {
            "name": "${params[0]}",
            "type": "debugpy",
            "request": "launch",\n` +
                envStr +
                program +
                args +
`            "console": "integratedTerminal",
        },\n`;

            // template
            // {
            //     "name": "main",
            //     "type": "debugpy",
            //     "request": "launch",
            //     "env": {
            //         "CUDA_VISIBLE_DEVICES": "1",
            //     },
            //     "program": "main.py",
            //     "args": [
            //         "--dir",
            //         "output",
            //     ],
            //     "console": "integratedTerminal"
            // },

            // confirm whether launch.json file exists
            const cwd = vscode.workspace.workspaceFolders;
            if (cwd) {
                const cwdPath = cwd[0].uri.fsPath;
                const launchPath = path.join(cwdPath, '.vscode', 'launch.json');
                if (!fs.existsSync(launchPath)) {
                    // create launch file
                    const confirmedCreate = await vscode.window.showInputBox({
                        prompt: '.vscode/launch.json does not exist. input \'y\' to create. Input enter or other string to directly get generated string.'
                    });
                    if (confirmedCreate === undefined) {
                        vscode.window.showInformationMessage('Parsing Cancelled.');
                    } else if (confirmedCreate?.trim().toLocaleLowerCase() === 'y') {
                        const launchContent = `// A launch configuration that compiles the extension and then opens it inside a new window
// Use IntelliSense to learn about possible attributes.
// Hover to view descriptions of existing attributes.
// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
{
    "version": "0.2.0",
    "configurations": [
${out}    ]
}`;
                        if (!fs.existsSync(path.join(cwdPath, '.vscode'))) {
                            fs.mkdirSync(path.join(cwdPath, '.vscode'));
                        }
                        fs.writeFileSync(launchPath, launchContent);
                        vscode.window.showInformationMessage('.vscode/launch.json created.');
                        const doc = await vscode.workspace.openTextDocument(launchPath);
                        const editor = await vscode.window.showTextDocument(doc, { preview: false });
                        selectTaskName(editor, 7, filenameLen);
                    } else {
                        // show the generated command
                        await showTextInVirtualFile(out, filenameLen);
                    }
                } else {
                    // add content to launch.json
                    const preline = '    "configurations": [';
                    const lines = fs.readFileSync(launchPath, 'utf8').split(/\r?\n/);
                    let startLine = 0;
                    for (let i=0; i<lines.length; i++) {
                        if (lines[i] === preline) {
                            startLine = i + 1;
                            break;
                        }
                    }
                    const doc = await vscode.workspace.openTextDocument(launchPath);
                    const editor = await vscode.window.showTextDocument(doc, { preview: false });
                    await editor.edit(editBuilder => {
                        const linePos = doc.lineAt(startLine).range.start;
                        editBuilder.insert(linePos, out);
                    });
                    selectTaskName(editor, startLine, filenameLen);
                }
            } else {
                // if no working space: show the generated command
                await showTextInVirtualFile(out, filenameLen);
            }
        } else {
            vscode.window.showErrorMessage(`Nothing input`);
        }
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
