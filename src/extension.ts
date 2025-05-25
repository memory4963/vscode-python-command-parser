// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
            // vscode.window.showInformationMessage(`input is: ${input}`);
            const pythonSplit = input.trim().split('python ');

            const oriEnv = pythonSplit.shift();

            let envStr = '';
            if (oriEnv) {
                // TODO: change different interpreter in the future, eg: /opt/conda/python, /opt/conda/python3
                if (!oriEnv.endsWith(' ')) {
                    vscode.window.showErrorMessage('Python path is not supported!');
                    return;
                }
                // process env
                envStr += '            "env": {\n';
                const envs = oriEnv.trim().split(' ');
                for (const env of envs) {
                    // TODO: check whether it is correct in the future.
                    const [k, v] = env.split('=');
                    envStr += '                "' + k + '": ';
                    envStr += '"' + v + '",\n';
                }
                envStr += '            },\n';
                console.log(envStr);
            }

            // suspect there are multiple "python" in the command
            const params = pythonSplit.join('python').split(' ');
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
                // TODO: make sure remote env still works
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
