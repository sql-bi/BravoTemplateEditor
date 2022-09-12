/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { nonce} from '../helpers/utils';

export class TableView {

	public disposed: boolean = false;
	private panel: vscode.WebviewPanel;
	uri: vscode.Uri;

	constructor(private context: vscode.ExtensionContext, uri: vscode.Uri, title: string, table: any[]) { 

		this.panel = vscode.window.createWebviewPanel(
			"bravo.table",
			title,
			{
				viewColumn: vscode.ViewColumn.Two,
				preserveFocus: true,
			},
			{
				enableScripts: true,
				localResourceRoots: [ this.context.extensionUri ],
				enableFindWidget: true,
				retainContextWhenHidden: true,

			}
		);

		this.panel.iconPath = {
			light: vscode.Uri.joinPath(this.context.extensionUri, "assets", "images", "table.svg"),
			dark: vscode.Uri.joinPath(this.context.extensionUri, "assets", "images", "table-dark.svg"),
		};
		this.setContent(uri, title, table);

		this.panel.onDidDispose(()=> {
			this.destroy();
		});
	}

	setContent(uri: vscode.Uri, title: string, table: any[]) {
		if (this.panel && (!this.uri || this.uri.path != uri.path)) {
			this.uri = uri;
			this.panel.title = title;
			this.panel.webview.html = this.webviewHtml(table);
		}
	}

	updateContent(table: any[]) {
		if (this.panel)
			this.panel.webview.html = this.webviewHtml(table);
	}

	private webviewHtml(table: any[]) {

		const cspSource = this.panel.webview.cspSource;
		const assets = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "assets"));
		const _nonce = nonce();

		return `<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${_nonce}'; img-src ${cspSource};">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<link href="${assets}/css/main.css" rel="stylesheet">
					<title>Choose a Power BI report</title>
				</head>
				<body class="table-view" data-uri="${this.uri.path}">
					<table id="preview-table">
						<thead>
							<tr>
								${Object.keys(table[0]).map(key => `
									<th>${key}</th>
								`).join("\n")}
							</tr>
						</thead>
						<tbody>
							${table.map(row => `
								<tr>
									${Object.values(row).map(value => `
										<td>${value}</td>
									`).join("\n")}
								</tr>
							`).join("\n")}
						</tbody>
					</table>
					<script nonce="${_nonce}" src="${assets}/js/tabulator.min.js"></script>
					<script nonce="${_nonce}" src="${assets}/js/table-view.js"></script>
				</body>
			</html>
		`;
	}

	destroy() {
		this.disposed = true;
		this.uri = null;
		this.panel = null;
	}
}