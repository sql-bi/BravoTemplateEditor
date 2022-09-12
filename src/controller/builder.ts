/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sleep, stripBOM, fileNameWithoutExtension } from '../helpers/utils';
import { Dispatchable } from '../helpers/dispatchable';
import * as sanitizeHtml from 'sanitize-html';

export class Builder extends Dispatchable {

    // Internal progress object used by VS Code status bar
    private progress: vscode.Progress<{ message: string, increment: number }>;

    /** 
     * Tell the builder to start another build at the end of the current one
     * This is useful if the user makes a change to a file during the building process
     */
    private buildEnqueued = false;
    
    /** 
     * Is the building running?
     */ 
    get building() {
        return this._building;
    }
    private _building = false;

    /**
     * Build controller for creating a template package
     */ 
    constructor(private context: vscode.ExtensionContext) {
        super();
    }

    /**
     * Build package
     */ 
    async build(overwriteExisting = true) {

        // Check if building already running - in case enqueue for later
        if (this.building) {
            this.buildEnqueued = true;
            return;
        }

        // Check writing permissions
        if (vscode.workspace.fs.isWritableFileSystem("file") === false) {
            this.fail("The workspace directory is read-only.");
            return;
        }

        // Get config paths
        let templateConfigFiles = await vscode.workspace.findFiles("**/src/*.template.json", "'**​/.vscode/**'", 1);
        if (!templateConfigFiles.length) {
            this.fail("Unable to find the main template file (*.template.json)");
            return;
        }
        const templateConfigFile = templateConfigFiles[0].fsPath;
        const templateConfigPath = path.parse(templateConfigFile);
        let templateConfigJson;
        try { templateConfigJson = JSON.parse(stripBOM(fs.readFileSync(templateConfigFile, "utf8"))); } catch(ignore) {}
        if (!templateConfigJson) {
            this.fail(`Invalid JSON file ${templateConfigFile}.`);
            return;
        }
        const templateConfigName = sanitizeHtml(templateConfigJson.Name || fileNameWithoutExtension(templateConfigPath.name), { allowedTags: [], allowedAttributes: {}});
        const packageFileName = `${templateConfigName}.package.json`;
        const packageDir = path.join(templateConfigPath.dir, "..", "dist");
        const packagePathName = path.join(packageDir, packageFileName);
        
        // Start building
        this._building = true;

        if (!overwriteExisting && fs.existsSync(packagePathName)) {
            this.success(packagePathName);
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: "Building package..."
        }, async (progress) => {
            this.progress = progress;

            // Sleep to show the status bar and to collect too fast changes in files
            await sleep(2);

            // Create package json structure
            let packageJson: any = {
                Config: {
                    TemplateUri: templateConfigPath.base,
                    Name: templateConfigName,
                    ...templateConfigJson
                }
            };

            const templateFiles = ("Templates" in templateConfigJson && Array.isArray(templateConfigJson.Templates) ? 
                templateConfigJson.Templates.map(template => template.Template) : []
            );

            const localizationFiles = ("LocalizationFiles" in templateConfigJson && Array.isArray(templateConfigJson.LocalizationFiles) ? 
                templateConfigJson.LocalizationFiles : []
            );
                    
            // Merge separate template files
            new Set([...templateFiles, ...localizationFiles]).forEach(fileName => {
                if (!this.building) return;

                if (fileName) {
                    const templateName = fileNameWithoutExtension(fileName);
                    const templatePathName = path.join(templateConfigPath.dir, fileName);
                    
                    if (fs.existsSync(templatePathName)) {
                        try {
                            const templateJson = JSON.parse(stripBOM(fs.readFileSync(templatePathName, "utf8")));
                            packageJson[templateName] = templateJson;
                        } catch (ignore) {
                            this.fail(`Invalid JSON file ${fileName}.`);
                        }
                    }
                }
            });
            if (!this.building) return;

            try {
                // Save package
                if (!fs.existsSync(packageDir))
                    fs.mkdirSync(packageDir, { recursive: true });

                fs.writeFileSync(packagePathName, JSON.stringify(packageJson, null, 4));
                this.success(packagePathName);

            } catch (ignore) {
                this.fail(`Unable to save the package file.`);
            }
        });
    }

    /**
     * Abort the building process and show an error
     */ 
    private fail(errorMessage: string) {
        if (this.building) {
            this._building = false;
            this.progress.report({ message: errorMessage, increment: 100 });
            
            vscode.window.showErrorMessage(`${errorMessage} The building process was aborted.`);
            this.trigger("fail");
        }
        this.complete();
    }

    /**
     * Building complete successfully
     */ 
    private success(packageFilePath: string) {
        if (this.building) {
            this._building = false;
            if (this.progress)
                this.progress.report({ message: "Package built successfully!", increment: 100 });

            this.trigger("success", packageFilePath);
        }
        this.complete();
    }

    /**
     * Complete the building process
     */ 
    private complete() {

        // Check if user requested another build while building
        if (this.buildEnqueued) {
            this.buildEnqueued = false;
            this.build();
        }
    }
}