/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from "child_process";
import * as path from 'path';
import { RequestInit, Response } from 'node-fetch';
import { Dispatchable } from '../helpers/dispatchable';
import { Dic, Utils, sleep, stripBOM } from '../helpers/utils';
import { ModelChanges } from '../model/model-changes';
import { PBIDesktopReport } from '../model/pbi-report';
import { TabularDatabase } from '../model/tabular';
import { appConfig } from '../extension';
import { AppError } from '../model/exceptions';

interface ApiRequest {
    action: string
    controller: AbortController
    timeout?: NodeJS.Timeout;
    aborted?: Utils.RequestAbortReason
}

export interface PreviewChangesRequest {
    settings: {
        customPackagePath: string
        previewRows: number
    }
    report: PBIDesktopReport
}

export class Host extends Dispatchable {

    static DEFAULT_TIMEOUT = 1 * 60 * 1000;

    _enabled = true;
    _running = false;
    _connected = false;
    //exePath: string;
    address: string;
    token: string;
    
    hostProc: cp.ChildProcess;
    requests: Dic<ApiRequest> = {};

     /**
     * Check if host can run in this env
     */ 
    get canRun() {
        return (this.context.extensionMode == vscode.ExtensionMode.Development || process.platform == "win32");
    }

    /**
     * Check if preview on Bravo is enabled
     */ 
    get enabled() {
        return this._enabled;
    }

    /**
     * Check if the host is running
     */ 
    get running() {
        return this.enabled && this.canRun && this._running; // && this.hostProc && !this.hostProc.killed;
    }

    /**
     * Check if the config contains valid address adn token
     */ 
    get connected() {
        return this.running && this._connected;
    }

    constructor(private context: vscode.ExtensionContext) {
        super();

        /**
         * In the future we will allow to execute Bravo.exe in dev mode directly from this extension.
         * We will need this option in package.json\configuration:
         * 
            "bravo.executablePath": {
                "type": "string",
                "default": "%ProgramFiles%\\SQLBI\\Bravo\\Bravo.exe",
                "markdownDescription": "Specifies the path where is located **Bravo.exe**. You can download it from the [Bravo website](https://bravo.bi)."
            },
         */

        this.loadSettings();
    }

    // Get host settings
    async loadSettings() {

        const settings = vscode.workspace.getConfiguration("bravo");

        // Enabled
        this._enabled = settings.get<boolean>("hostEnabled");

        // Executable path
        /*let exePath = settings.get<string>("executablePath"); 
        if (exePath) {
            exePath = path.normalize(exePath);
            if (!fs.existsSync(exePath)) 
                exePath = null;
        }*/

        // Address and Token 
        this.address = null;
        this.token = null;
        const appConfigFiles = await vscode.workspace.findFiles(appConfig);
        if (appConfigFiles.length) {
            try {
                const configJson = JSON.parse(stripBOM(fs.readFileSync(appConfigFiles[0].fsPath, "utf8")));
                this.address = configJson.address;
                this.token = configJson.token;
            } catch (error) {
                console.error(error);
            }
        } else {
            console.error(`Unable to find ${appConfig}.`);
        }

        this.restart();
    }

    /**
     * Show a warning to the user asking for the host path
     */
    /*async askForExePath() {

        const downloadUrl = "https://github.com/sql-bi/Bravo/releases/latest";
        const browse = "Browse"
        const download = "Download Bravo";
        const choice = await vscode.window.showInformationMessage(
            `Bravo for Power BI not found on your system. Choose the executable location or download it to enable all the features of this extension.`,
            browse, 
            download
        );
        if (choice === browse) {
            vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { "Bravo Executable": ["bravo.exe"] },
                title: "Choose Bravo location",
                openLabel: "Choose"
            }).then(value => {
                if (value && value.length) {
                    const exePath = value[0].fsPath;
                    const settings = vscode.workspace.getConfiguration(extConfig);
                    settings.update("executablePath", exePath, true);
                    this.exePath = exePath;
                }
            });
        } else if (choice === download) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(downloadUrl));
        }
    }*/

    /**
     * Execute the host
     */ 
    async start() {

        // User disable preview or can't run on this environment
        if (!this.enabled || !this.canRun) return;

        /*
        // Host path is not valid
        if (!this.running) {
            if (!this.exePath) this.askForExePath();
            if (!this.exePath) {
                this._running = false;
                return;
            }

            // Execute host with special flags
            this.hostProc = cp.exec(`${this.exePath} --dev=true --address=${this.address} --token=${this.token}`, 
                {
                    killSignal: "SIGINT",
                    windowsHide: true
                },
                (error, stdout, stderr) => {
                    if (error || stderr) {
                        vscode.window.showInformationMessage(`Unable to run Bravo for Power BI.\n\n${error || stderr}`);
                        this.hostProc = null;
                    }
                }
            );
            if (this.hostProc == null) {
                this._running = false;
                return;
            }
        }
        */
        try {
            await this.checkConnection();
        } catch (ignore) {} 
    }

    /**
     * Kill the host
     */ 
    stop() {
        if (this.hostProc)
            this.hostProc.kill("SIGINT");
        this._running = false;
    }

    /**
     * Restart the host
     */ 
    async restart() {
        this.stop();
        await this.start();
        this.trigger("restart");
    }

    /** API helpers **/

    // API Call wrapper
    apiCall(action: string, data = {}, options: RequestInit = {}, timeout = Host.DEFAULT_TIMEOUT): Promise<any> {

        if (!this.enabled || !this.canRun || !this.address || !this.token)
            return Promise.resolve(null);

        let requestId = Utils.Text.uuid();
        let abortController = new AbortController();
        this.requests[requestId] = {
            action: action,
            controller: abortController
        };

        if (!("method" in options))
            options["method"] = "GET";
        
        options["signal"] = <any>abortController.signal;

        if (timeout) {
            this.requests[requestId].timeout = setTimeout(()=> {
                this.apiAbortById(requestId, "timeout");
            }, timeout);
        }

        return Utils.Request.ajax(`${this.address}/${action}`, data, options, this.token)
            .then(response => {
                this._running = true;
                this._connected = true;
                return response;
            })
            .catch(async (response: Response | Error) => {

                let problem;

                //Catch unhandled errors, like an aborted request
                if (response instanceof Error) {

                    let status = Utils.ResponseStatusCode.InternalError;
                    if (Utils.Request.isAbort(response)) {
                        if (requestId in this.requests && this.requests[requestId].aborted == "timeout")
                            status = Utils.ResponseStatusCode.Timeout;
                        else 
                            status = Utils.ResponseStatusCode.Aborted;
                    }

                    problem = {
                        status: status,
                        title: response.message
                    }

                    this._running = false;
                    this._connected = false;
                } else {
                    problem = await response.json(); 

                    this._running = true;
                    this._connected = (
                        response.status != Utils.ResponseStatusCode.NotAuthorized && 
                        response.status != Utils.ResponseStatusCode.NotFound &&
                        response.status != Utils.ResponseStatusCode.Forbidden &&
                        response.status != Utils.ResponseStatusCode.Timeout
                    );
                }
                
                throw (this.connected ? AppError.InitFromProblem(problem) : AppError.InitFatalError());
            })
            .finally(()=>{
                this.apiCallCompleted(requestId);
            });
    }

    // API Call Completed
    apiCallCompleted(requestId: string) {
        if (requestId in this.requests) {
            if ("timeout" in this.requests[requestId])
                clearTimeout(this.requests[requestId].timeout);
                
            delete this.requests[requestId];
        }
    }

    // Abort API
    apiAbortById(requestId: string, reason: Utils.RequestAbortReason = "user") {
        if (requestId in this.requests) {
            try {
                this.requests[requestId].aborted = reason;
                this.requests[requestId].controller.abort();
            } catch (ignore) {}
        }
    }

    apiAbortByAction(actions: string | string[], reason: Utils.RequestAbortReason = "user") {
        for (let requestId in this.requests) {
            if (Utils.Obj.isArray(actions) ? actions.indexOf(this.requests[requestId].action) >= 0 : actions == this.requests[requestId].action) {
                this.apiAbortById(requestId, reason);
            }
        }
    }

    /** API **/
    
    checkConnection() {
        return this.apiCall("TemplateDevelopment/GetReports");
    }

    getModel(report: PBIDesktopReport)  {
        return this.apiCall("TemplateDevelopment/GetModel", report, { method: "POST" })
                    .then(database => <[TabularDatabase, PBIDesktopReport]>[database, report]);
    }

    getReports() {
        return <Promise<PBIDesktopReport[]>>this.apiCall("TemplateDevelopment/GetReports");
    }

    getPreviewChanges(request: PreviewChangesRequest) {
        return <Promise<ModelChanges>>this.apiCall("TemplateDevelopment/GetPreviewChanges", request, { method: "POST" });
    }

    openPBIX(reportPath: string) {
        return <Promise<PBIDesktopReport>>this.apiCall("TemplateDevelopment/PBIDesktopOpenPBIX", { path: reportPath, waitForStarted: true });
    }

    abortOpenPBIX() {
        this.apiAbortByAction("TemplateDevelopment/PBIDesktopOpenPBIX");
    }
}