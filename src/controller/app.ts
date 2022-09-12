/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { PBIDesktopReport } from '../model/pbi-report';
import { PowerBiView } from '../view/powerbi-view';
import { Host } from './host';
import { ModelChangesView } from '../view/model-changes-view';
import { Builder } from './builder';
import { appConfig } from '../extension';
import { AppError, AppErrorType } from '../model/exceptions';

export class App {

    host: Host;
    builder: Builder;
    fileWatcher: vscode.FileSystemWatcher;

    powerbiView: PowerBiView;
    modelChangesView: ModelChangesView;

    package: string;
    report: PBIDesktopReport;

    constructor(private context: vscode.ExtensionContext) {

        // Build
        this.builder = new Builder(context);
        this.builder.on("success", (packageFilePath: string) => {
            this.package = packageFilePath;
            this.updateModelChangesView();
        });
        this.builder.build(false);

        // Preview via Bravo Host
        this.host = new Host(context);
        this.host.on("restart", () => this.loadViews());
        this.loadViews();
        
        // Watch
        this.watchFiles();
        this.watchConfig();
    }

    /**
     * Watch configuration changes
     */ 
    watchConfig() {

        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (//e.affectsConfiguration("bravo.executablePath") ||
                 e.affectsConfiguration("bravo.hostEnabled")) {
                    this.host.loadSettings();
                    this.updatePowerBiView();
            }
        }));
    }

    /**
     * Watch files for changes
     */ 
    watchFiles() {

        const onChange = (e: vscode.Uri) => {
            if (!e) return;
            if (e.path.includes(appConfig)) 
                this.host.loadSettings();
            else
                this.builder.build();
        };

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(`**/{src/*.json,${appConfig}}`); //"**/*.json"
        this.fileWatcher.onDidChange(e => onChange(e));
        this.fileWatcher.onDidCreate(e => onChange(e));
    }

    /**
     * Load web views
     */ 
    loadViews() {

        vscode.commands.executeCommand("setContext", "bravo.canPreview", this.host.connected);
        vscode.commands.executeCommand("setContext", "bravo.connectionFailed", false);

        // Power BI selector
        if (!this.powerbiView) {
            this.powerbiView = new PowerBiView(this.context, this.host);
            this.powerbiView.onReportChoose(report => {

                this.report = report;
                vscode.commands.executeCommand("setContext", "bravo.hasReport", report != null);
                this.updateModelChangesView();
            });
            this.powerbiView.onError(error => this.raiseError(error));
        } else {
            this.updatePowerBiView();
        }

        // Changes preview
        if (!this.modelChangesView) {
            this.modelChangesView = new ModelChangesView(this.context, this.host);
            this.modelChangesView.onError(error => this.raiseError(error));
        } else {
            this.updateModelChangesView();
        }
    }

    /**
     * Update model changes view
     */ 
    updateModelChangesView() {
        if (this.modelChangesView) {
            this.modelChangesView.report = this.report;
            this.modelChangesView.package = this.package;
            this.modelChangesView.refresh();
        }
    }

    /**
     * Update Power BI View
     */ 
    updatePowerBiView() {
        if (this.powerbiView)   
            this.powerbiView.updateWebview();
    }

    /**
     * Raise an error to every view
     */  
    raiseError(error: AppError) {
        if (error.type == AppErrorType.Fatal) {
            vscode.commands.executeCommand("setContext", "bravo.connectionFailed", true);

            if (this.powerbiView)
                this.powerbiView.raiseError();

            if (this.modelChangesView)
                this.modelChangesView.raiseError();
        } else {
            vscode.window.showErrorMessage(error.toString());
            console.error(error);
        }
    }

    /**
     * Destroy app
     */ 
    destroy() {
        // Stop file watcher
        if (this.fileWatcher)
            this.fileWatcher.dispose();

        // Stop host
        if (this.host)
            this.host.stop();
    }
}