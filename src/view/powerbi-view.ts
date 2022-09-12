/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { PBIDesktopReport } from '../model/pbi-report';
import { nonce, Utils } from '../helpers/utils';
import { Host } from '../controller/host';
import { AppError } from '../model/exceptions';

interface RefreshWebMessage {
	type: string;
	reports: [number, string][];
	selectedId: number;
	error?: string;
}

export class PowerBiView implements vscode.WebviewViewProvider {

	private _onReportChoose: vscode.EventEmitter<PBIDesktopReport> = new vscode.EventEmitter<PBIDesktopReport>();
	readonly onReportChoose: vscode.Event<PBIDesktopReport> = this._onReportChoose.event;

	private _onError: vscode.EventEmitter<AppError> = new vscode.EventEmitter<AppError>();
	readonly onError: vscode.Event<AppError> = this._onError.event;
	
	private view: vscode.WebviewView;
	private reports: PBIDesktopReport[] = [];
	selectedReport: PBIDesktopReport;

	constructor(private context: vscode.ExtensionContext, private host: Host) { 
		this.context.subscriptions.push(vscode.window.registerWebviewViewProvider("bravo.powerbi", this, { webviewOptions: { retainContextWhenHidden: true }}));
		vscode.commands.registerCommand("bravo.refreshReports", ()=> this.refresh());
	}

	resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {

		this.view = webviewView;
		let webview = webviewView.webview;

		webview.options = {
			enableScripts: true,
			localResourceRoots: [ this.context.extensionUri ],
		};

		webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case "attach": 
					this.selectedReport = (data.reportId && this.reports ? this.reports.find(report => report.id == data.reportId) : null);
					this._onReportChoose.fire(this.selectedReport);
					break;

				case "browse": 
					this.browse();
					break;

				case "refresh":
					this.refresh();
					break;
				
				case "abort":
					this.host.abortOpenPBIX();
					break;
				
				case "goto-setting": 
					vscode.commands.executeCommand("workbench.action.openSettings", "bravo.hostEnabled");
					break;
			}
		});

		/*webviewView.onDidChangeVisibility(e => {
			if (this.view && this.view.visible) {
				this.updateWebview();
			}
		});*/
		
		this.updateWebview();
	}

	updateWebview() {
		if (this.view) {
			this.view.webview.html = this.webviewHtml();
			setTimeout(()=> this.refresh(), 700);
		}
	}

	private webviewHtml() {

		const cspSource = this.view.webview.cspSource;
		const assets = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "assets"));
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
				<body class="powerbi-view">
					<div class="report-selector">
						<p>Choose a Power BI Desktop report to preview your template.</p>

						<div class="select-with-icon">
							<img src="${assets}/images/powerbi.svg" class="light">
							<img src="${assets}/images/powerbi-dark.svg" class="dark">
							<select class="attach">
								<option value="">Loading...</option>
							</select>
							
						</div>
						<div class="browse-section">
							<div class="browse link" role="button">Browse</div>
						</div>

						<div class="pbi-observing">
							<div class="waiting-logo">
								<img src="${assets}/images/powerbi.svg" class="light">
								<img src="${assets}/images/powerbi-dark.svg" class="dark">
							</div>
							<div class="message">
								Waiting for file opening in Power BI Desktop... <span class="cancel-observing link">Cancel</span>
							</div>
						</div>
					</div>
					<div class="error-message"></div>
					<script nonce="${_nonce}" src="${assets}/js/powerbi-view.js"></script>
				</body>
			</html>
		`;
	}

	updateWebviewContent() {
		if (this.view && this.view.visible) {
			let error = "";
			if (!this.host.enabled) {
				error = `
					<p>Preview on Bravo for Power BI has been disabled. Enable it in the <span class="link goto-setting">extension settings</span>.</p>
				`;
			} else if (!this.host.canRun) {
				error = `
					<p>This extension works on Windows platform only.</p>
				`;
			/*} else if (!this.host.exePath) {
				error = `
					<p>Bravo for Power BI has not been found on your system.</p>
				`;
			*/} else if (!this.host.running) {
				error = `
					<p>Bravo for Power BI is not running or not available on your system. <span class="refresh link">Retry</span></p>
				`;
			} else if (!this.host.connected) {
				error = `
					<p>The active instance of Bravo for Power BI is not connected to this project.</p>
					<p>Go to the <em>Templates</em> tab of Bravo for Power BI options, and:</p> 
					<ol>
						<li>Locate or import this workspace there.</li>
						<li>Click the <b>Edit</b> button and Bravo will send you back to this window.</li>
						<li><span class="link refresh">Refresh this panel</span>.</li>
					</ol>
				`;
			}
		
			this.view.webview.postMessage(<RefreshWebMessage>{ 
				type: "refresh", 
				reports: this.reports ? this.reports.filter(report => report && report.reportName).map(report => [report.id, report.reportName]) : null, 
				selectedId: this.selectedReport ? this.selectedReport.id : 0,
				error: error
			});
		}
	}


	refresh() {
		vscode.window.withProgress({ location: { viewId: "bravo.powerbi" } }, progress => 
			this.host.getReports()
				.then(reports => {

					this.reports = reports;
					if (reports) {
						if (this.selectedReport && !this.reports.find(report => report.id == this.selectedReport.id))
							this.selectedReport = null;
					} else {
						this.selectedReport = null;
					}
					this.updateWebviewContent();
					return true;
				})
				.catch((error: AppError) => this._onError.fire(error))
		);
	}

	raiseError() {
		this.reports = null;
		this.selectedReport = null;
		this.updateWebviewContent();
	}

	browse() {
		vscode.window.showOpenDialog({
			canSelectMany: false,
			filters: { "Power BI Report Files": ["pbix"] },
			title: "Open report",
			openLabel: "Open"
		}).then(value => {
			if (value && value.length) {
				this.view.webview.postMessage({type: "opening"});
				const reportPath = value[0].fsPath;
				this.host.openPBIX(reportPath)
					.then(report => {
						if (report) {
							this.selectedReport = report;
							this.refresh();
							this._onReportChoose.fire(report);
						}
					})
					.catch((error: AppError) => this._onError.fire(error))
					.finally(()=>{
						this.view.webview.postMessage({type: "doneOpening"});
					});	
			}
		});
	}

}