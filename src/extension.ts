/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { App } from './controller/app';

export const appConfig = "bravo-config.json";

let app: App;

// Contexts
vscode.commands.executeCommand("setContext", "bravo.isTemplateWorkspace", vscode.workspace.findFiles(appConfig));
vscode.commands.executeCommand("setContext", "bravo.canPreview", false);
vscode.commands.executeCommand("setContext", "bravo.hasReport", false);
vscode.commands.executeCommand("setContext", "bravo.connectionFailed", false);

// Activate
export function activate(context: vscode.ExtensionContext) {

	console.log(`${context.extension.id} started.`);

	app = new App(context);
}

// Deactivate
export function deactivate() {
	app.destroy();
}
