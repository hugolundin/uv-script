import * as vscode from 'vscode';

import { exec, ExecException } from 'child_process';
import { PythonExtension } from '@vscode/python-extension';


const shellCommand = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) {
                return reject(err);
            }

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

		// Sync script dependencies.
		try {
			await shellCommand('uv sync --script ' + activeFilePath);
		} catch (error: any) {
			const syncError: ExecException = error;

			if (syncError.message.includes("does not contain a PEP 723 metadata tag")) {
				await vscode.window.showErrorMessage(
					"Script does not contain a PEP 723 metadata tag.",
					"Fix"
				).then(async selection => {
					switch (selection) {
						case 'Fix':
							try {
								await shellCommand('uv init --script ' + activeFilePath);
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
				vscode.window.showErrorMessage("Unknown error: " + syncError.message);
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
				vscode.window.showErrorMessage('Script interpreter path is not valid');
				return;
			}
			
			// Update the Python interpreter for the active file.
			await pythonApi.environments.updateActiveEnvironmentPath(interpreterPath);

		} catch (error: any) {
			const findError: ExecException = error;
			vscode.window.showErrorMessage("Unknown error: " + findError.message);
			return;
		}

		vscode.window.showInformationMessage("Script environment has been configured.");
	});

	context.subscriptions.push(useEnvironment);
}

// This method is called when your extension is deactivated
export function deactivate() {}
