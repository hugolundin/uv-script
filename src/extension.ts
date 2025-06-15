import * as vscode from 'vscode';

import { exec, ExecException } from 'child_process';
import { PythonExtension } from '@vscode/python-extension';
import path from 'path';


const shellCommand = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        exec(cmd, (err, stdout) => {
			console.log(cmd);

            if (err) {
				console.log(err);
                return reject(err);
            }

			console.log(stdout);
            return resolve(stdout);
        });
    });


export async function activate(context: vscode.ExtensionContext) {
	const pythonApi: PythonExtension = await PythonExtension.api();

	/**
	 * Use script environment. 
	 * 
	 * Given that the current file has valid inline script metadata (PEP 723),
	 * ask uv to sync script dependencies and thereafter set the selected 
	 * Python interpreter to the script environment. 
	 */
	const useEnvironment = vscode.commands.registerCommand('uv-script.useEnvironment', async () => {
		// Get the file path for the active text editor.
		const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
		if (!activeFilePath) {
			vscode.window.showWarningMessage("No script is open.");
			return;
		}

		const activeFileName = path.basename(activeFilePath);

		// Sync script dependencies.
		try {
			await shellCommand('uv sync --script ' + activeFilePath);
		} catch (error: any) {
			const syncError: ExecException = error;

			if (syncError.message.includes("to read") && syncError.message.includes("not found")) {
				vscode.window.showErrorMessage("'" + activeFileName + "' must be saved before a script environment can be initialized.");
				return;
			}

			if (syncError.message.includes("does not contain a PEP 723 metadata tag")) {
				await vscode.window.showErrorMessage(
					"Script does not contain a PEP 723 metadata tag.",
					"Fix"
				).then(async selection => {
					switch (selection) {
						case 'Fix':
							try {
								await shellCommand('uv init --script ' + activeFilePath);
								await shellCommand('uv sync --script ' + activeFilePath);
							} catch (error: any) {
								const initError: ExecException = error;
								vscode.window.showErrorMessage("Failed to initialize script: " + initError.message);
								return;
							}
						
							break;
						default:
							return;
					}
				});
			} else {
				vscode.window.showErrorMessage(syncError.message);
				return;
			}
		}

		// Find and set interpreter path.
		try {
			const stdout = await shellCommand('uv python find --script ' + activeFilePath);
			const interpreterPath = stdout.trim();
			
			// Make sure that the Python Language Support extension is ready to receive commands. 
			await pythonApi.ready;
			
			// Validate that the provided interpreter path leads to a valid python environment.
			const pythonEnvProperties = await pythonApi.environments.resolveEnvironment(interpreterPath);
			if (!pythonEnvProperties) {
				vscode.window.showErrorMessage('Script interpreter path is not valid.');
				return;
			}
			
			// Update the Python interpreter for the active file.
			await pythonApi.environments.updateActiveEnvironmentPath(interpreterPath);

		} catch (error: any) {
			const findError: ExecException = error;
			vscode.window.showErrorMessage("Unknown error: " + findError.message);
			return;
		}

		vscode.window.showInformationMessage("Using interpreter from '" + activeFileName + "' environment.");
	});

	context.subscriptions.push(useEnvironment);
}

// This method is called when your extension is deactivated
export function deactivate() {}
