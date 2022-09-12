/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/
import * as vscode from 'vscode';
import { Dic } from './utils';

export interface VirtualDoc {
    content: string;
}   
export class VirtualDocs {

    provider: VirtualDocProvider;
    private docs: Dic<VirtualDoc>;

     /**
     * A singleton wrapper for standard Power BI formatter.  
     * It saves every formatter in a dictionary with a key as a stringified version 
     * of the formatting options so to recycle memory as much as possible.  
     */
    private static _instance: VirtualDocs;
    public static get instance(): VirtualDocs {
        if (!VirtualDocs._instance)
            VirtualDocs._instance = new this();
        return VirtualDocs._instance;
    }
    
    private constructor() { 
        if (VirtualDocs._instance) return VirtualDocs._instance;
        VirtualDocs._instance = this;
        this.clear();
        this.provider = new VirtualDocProvider();
    }

    add(uri: vscode.Uri, content: string) {
        this.docs[uri.path] = { 
            content: content
        };
    }

    pick(uri: vscode.Uri): VirtualDoc {
        if (uri.path in VirtualDocs.instance.docs)
            return VirtualDocs.instance.docs[uri.path];
        
        return null;
    }

    clear(key?: string) {
        if (key != null && key !== undefined) {
            delete this.docs[key];
        } else {
            this.docs = {};
        }
    }

    updateVisible() {
        vscode.window.visibleTextEditors.forEach(editor => {
            const uri = editor.document.uri;
            if (this.pick(uri))
                this.provider.onDidChangeEmitter.fire(uri);
        });
    }

    async doc(uri: vscode.Uri) {
        const doc = VirtualDocs.instance.docs[uri.path];
        if (doc)
            this.provider.onDidChangeEmitter.fire(uri); // Invalidate VSCode cache
        
        return await vscode.workspace.openTextDocument(uri);
    }

}

export class VirtualDocProvider implements vscode.TextDocumentContentProvider {

    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
        const doc = VirtualDocs.instance.pick(uri);
        return (doc ? doc.content : null);
    }
}