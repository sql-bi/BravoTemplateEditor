/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { PBIDesktopReport } from '../model/pbi-report';
import { Dic, nonce, Utils } from '../helpers/utils';
import { Host, PreviewChangesRequest } from '../controller/host';
import { ColumnChanges, MeasureChanges, ModelChanges, TableChanges } from '../model/model-changes';
import { TabularDatabase } from '../model/tabular';
import { VirtualDocProvider, VirtualDocs } from '../helpers/virtual-docs';
import { TableView } from './table-view';
import { DaxDocScheme, DaxDocType, getDaxDocUri, isDaxDoc, isDaxTableDoc, sanitizeDax } from '../model/dax-doc';
import { AppError } from '../model/exceptions';

export class ModelChangesView {

	public report: PBIDesktopReport;
	public package: string;

	private treeDataProvider: ModelChangesViewProvider;
	private treeView: vscode.TreeView<ModelChangesItem>;
	private tableView: TableView;

	private _onError: vscode.EventEmitter<AppError> = new vscode.EventEmitter<AppError>();
	readonly onError: vscode.Event<AppError> = this._onError.event;

	constructor(private context: vscode.ExtensionContext, private host: Host) {

		this.treeDataProvider = new ModelChangesViewProvider();
		this.treeView = vscode.window.createTreeView("bravo.modelChanges", {
			treeDataProvider: this.treeDataProvider
	  	});
		this.context.subscriptions.push(this.treeView);

		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.refreshModelChanges", ()=> this.refresh())
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.treeIsTree", ()=> this.toggleTreeView(false))
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.treeIsPlain", ()=> this.toggleTreeView(true))
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.hiddenIsVisible", ()=> this.toggleHidden(false))
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.hiddenIsHidden", ()=> this.toggleHidden(true))
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.hidden", ()=> { /* Do nothing */ })
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.viewDaxItem", (uri: vscode.Uri, preview?: boolean, highlight?: string) => this.viewDaxDoc(uri, preview, highlight))
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.previewTable", () => this.viewTable())
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("bravo.copyNode", (item: vscode.TreeItem) => {
				if (item && item.label)
					vscode.env.clipboard.writeText(item.label.toString());
			})
		);

		vscode.window.onDidChangeActiveTextEditor(e => {
			if (e && e.document && isDaxDoc(e.document.uri)) {

				this.selectTreeViewItem(e.document.uri);

				if (isDaxTableDoc(e.document.uri))
					this.viewTable(e.document.uri);
			}
		});

		const docProvider = VirtualDocs.instance.provider;
		this.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DaxDocScheme.table, docProvider));
		this.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DaxDocScheme.measure, docProvider));
	}

	selectTreeViewItem(uri: vscode.Uri) {
		if (this.treeView) {
			const item = this.treeDataProvider.getTreeItemFromUri(uri);
			if (item)
				this.treeView.reveal(item, { select: true  });
		}
	}

	toggleTreeView(toggle: boolean) {
		const settings = vscode.workspace.getConfiguration("bravo");
		settings.update("treeView", toggle, true)
			.then(()=> this.refresh());
	}

	toggleHidden(toggle: boolean) {
		const settings = vscode.workspace.getConfiguration("bravo");
		settings.update("showHidden", toggle, true)
			.then(()=> this.refresh());
	}

	refresh() {
		
		if (this.report && this.package) {

			vscode.window.withProgress({ location: { viewId: "bravo.modelChanges" } }, progress => 
				this.host.getModel(this.report)
					.then(response => {
						
						this.treeDataProvider.report = this.report;
						this.treeDataProvider.model = response[0];
						this.treeDataProvider.modelChanges = null;

						const settings = vscode.workspace.getConfiguration("bravo");
        				const numberOfRows = settings.get<number>("previewRows"); 

						const request: PreviewChangesRequest = {
							report: this.report,
							settings: {
								customPackagePath: this.package,
								previewRows: numberOfRows
							}
						};
						return this.host.getPreviewChanges(request)
							.then(response => {
								this.treeDataProvider.modelChanges = response;
								this.treeDataProvider.refresh();

								if (this.tableView) {
									const table = this.treeDataProvider.getData(this.tableView.uri, "table");
									if (table && table.preview)
										this.tableView.updateContent(table.preview);
								}
							});
					})
					.catch((error: AppError) => this._onError.fire(error))
			);
		} else {
			this.raiseError();
		}
	}

	raiseError() {
		this.report = null;
		this.tableView = null;
		this.treeDataProvider.reset();
	}

	async viewDaxDoc(uri: vscode.Uri, preview = false, highlight?: string) {

		const doc = await VirtualDocs.instance.doc(uri);
		vscode.languages.setTextDocumentLanguage(doc, "dax");
		const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Active, preserveFocus: true });
		
		if (preview) 
			this.viewTable(uri);

		if (highlight) {
			let fullText = doc.getText();
			let re = new RegExp(`"${highlight}"`, "m");
			let match = fullText.match(re);
			if (match) {
				let startPos = editor.document.positionAt(match.index);
				let endPos = editor.document.positionAt(match.index + match[0].length);
				editor.selection = new vscode.Selection(startPos, endPos);
				let range = new vscode.Range(startPos, endPos);
				editor.revealRange(range);
				vscode.commands.executeCommand("actions.findWithSelection");
			}
		}
	}

	async viewTable(uri?: vscode.Uri) {
		
		const ignoreDisposed = !!uri;
		if (!uri) {
			if (!vscode.window.activeTextEditor) return;
			const { document } = vscode.window.activeTextEditor;
			if (!isDaxDoc(document.uri)) return;
			uri = document.uri;
		}

		const table = this.treeDataProvider.getData(uri, "table");
		if (table && table.preview){
			const title = `Preview ${table.name}`;
			if (!this.tableView || (!ignoreDisposed && this.tableView.disposed)) {
				this.tableView = new TableView(this.context, uri, title, table.preview);
			} else {
				this.tableView.setContent(uri, title, table.preview);
			}
		}
	}
}

export class ModelChangesViewProvider implements vscode.TreeDataProvider<ModelChangesItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<ModelChangesItem | undefined | void> = new vscode.EventEmitter<ModelChangesItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ModelChangesItem | undefined | void> = this._onDidChangeTreeData.event;

	public model: TabularDatabase;
	public modelChanges: ModelChanges;
	public report: PBIDesktopReport;
	private modelChangesTree: ModelChangesItem;

	constructor() {
	}

	reset() {
		this.model = null;
		this.modelChanges = null;
		this.report = null;
		this.refresh();
	}

	findItem(root: ModelChangesItem, match: (a: ModelChangesItem)=>boolean) {
		const traverse = (node: ModelChangesItem): ModelChangesItem => {
			if (node) {
				if (match(node))
					return node;

				if (node.children) {
					for (let i = 0; i < node.children.length; i++) {
						let child = traverse(node.children[i]);
						if (child) return child;
					}
				}
			}
			return null;
		};
		return traverse(root);
	}

	getData(uri: vscode.Uri, type: DaxDocType) {
		if (this.report && this.model && this.modelChanges && this.modelChanges.modifiedObjects) {
			if (type == "table") {
				return this.modelChanges.modifiedObjects.find(table => 
					getDaxDocUri("table", this.report, table.name).path == uri.path
				);
			} else {
				// Not implemented
			}
		}
		return null;
	}

	refresh() {
		VirtualDocs.instance.clear();
		this.modelChangesTree = this.getModelChangesTree();
		this._onDidChangeTreeData.fire();
		VirtualDocs.instance.updateVisible();
	}

	getTreeItem(element: ModelChangesItem): ModelChangesItem {
		return element;
	}

	getTreeItemFromUri(uri: vscode.Uri): ModelChangesItem {
		return this.findItem(this.modelChangesTree, a => a.uri && a.uri.scheme == uri.scheme && a.uri.path == uri.path);
	}

	getChildren(element?: ModelChangesItem): Thenable<ModelChangesItem[]> {

		let children: ModelChangesItem[] = [];
		if (this.modelChangesTree)
			children = (element ? element.children.sort((a, b) => a.label.localeCompare(b.label)) : this.modelChangesTree.children);

		return Promise.resolve(children);
	}

	getParent(element: ModelChangesItem): ModelChangesItem {
		
		let pathComponents = element.id.split("\\");
		pathComponents.pop();
		const targetPath = pathComponents.join("\\");

		return this.findItem(this.modelChangesTree, a => a.id == targetPath);
	}

	private getModelChangesTree(): ModelChangesItem {

		if (!this.modelChanges || !this.modelChanges.modifiedObjects) 
			return null;

		const settings = vscode.workspace.getConfiguration("bravo");
		const treeViewEnabled = settings.get<boolean>("treeView"); 
		const showHidden = settings.get<boolean>("showHidden"); 

		let rootChildren: ModelChangesItem[] = [
			new ModelChangesItem(
				"tables", 
				"Dates", 
				"table-fx", 
				this.getTableBranches(treeViewEnabled, showHidden),
				false,
				treeViewEnabled ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
			)
		];

		if (this.modelChanges.modifiedObjects.find(table => table.measures && table.measures.length))
			rootChildren.push(new ModelChangesItem(
				"measures", 
				"Time Intelligence", 
				"folder-fx", 
				this.getMeasuresBranches(treeViewEnabled, showHidden),
				false,
				treeViewEnabled ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
			));

		return new ModelChangesItem("", "", "", rootChildren);
	}

	private getTableBranches(tree = true, hidden = true): ModelChangesItem[] {

        let branches: Dic<ModelChangesItem> = {};
        
        if (this.modelChanges && this.modelChanges.modifiedObjects) {
            this.modelChanges.modifiedObjects.forEach(table => {

				const parentId = `tables\\${table.name}`;

				if (table.isHidden && !hidden) return;

				const uri = getDaxDocUri("table", this.report, table.name);

                if ((table.columns && table.columns.length) || (table.hierarchies && table.hierarchies.length)) {
                    if (!(table.name in branches))
                        branches[table.name] = new ModelChangesItem(
							parentId, 
							table.name, 
							"table", 
							[], 
							table.isHidden, 
							tree ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
							{ command: "bravo.viewDaxItem", title: "View Table", arguments: [uri, true] },
							uri
						);

                    if (tree) {
						if (table.columns) {
							table.columns.forEach(column => {

								if (column.isHidden && !hidden) return;

								branches[table.name].children.push(new ModelChangesItem(
									`${parentId}\\${column.name}`, 
									column.name, 
									(column.dataType ? column.dataType.toLowerCase() : ""), 
									null, 
									column.isHidden, 
									vscode.TreeItemCollapsibleState.None,
									{ command: "bravo.viewDaxItem", title: "View Column", arguments: [uri, true, column.name] },
									uri
								));
							});
						}

						if (table.hierarchies) {
							table.hierarchies.forEach(hierarchy => {

								const parentId = `tables\\${table.name}\\hierarchy[${hierarchy.name}]`;

								if (hierarchy.isHidden && !hidden) return;

								let hierarchyChildren: ModelChangesItem[] = [];
								hierarchy.levels.forEach(level => {

									const hierarchyColumn = table.columns.find(c => c.name == level);
									if (hierarchyColumn && hierarchyColumn.isHidden && !hidden) return;

									hierarchyChildren.push(new ModelChangesItem(
										`${parentId}\\${level}`,
										level,
										"",
										null,
										(hierarchyColumn ? hierarchyColumn.isHidden : false),
										vscode.TreeItemCollapsibleState.None,
										{ command: "bravo.viewDaxItem", title: "View Column", arguments: [uri, true, level] },
										uri
									));
								});

								branches[table.name].children.push(new ModelChangesItem(
									parentId,
									hierarchy.name,
									"hierarchy",
									hierarchyChildren,
									hierarchy.isHidden
								));
							});
						}
					}
                }

				if (table.expression)
					VirtualDocs.instance.add(uri, sanitizeDax(table.expression));
            });
        }

        return Object.values(branches);
    }

	private getMeasuresBranches(tree = true, hidden = true): ModelChangesItem[] {

        let branches: Dic<ModelChangesItem> = {};
        
        if (this.modelChanges && this.modelChanges.modifiedObjects) {

            this.modelChanges.modifiedObjects.forEach(table => {

                if (table.measures && table.measures.length) {

					const parentId = `measures\\${table.name}`;

					if (table.isHidden && !hidden) return;

					if (tree) {
						if (!(table.name in branches)) {

							branches[table.name] = new ModelChangesItem(
								parentId,
								table.name,
								"table",
								[],
								table.isHidden
							);
						}
					}

                    table.measures.forEach(measure => {

						if (measure.isHidden && !hidden) return;

						const uri = getDaxDocUri("measure", this.report, measure.name);

						if (tree) {
							let folders = (measure.displayFolder ? measure.displayFolder.split("\\") : []);
					
							if (!("children" in branches[table.name]))
								branches[table.name].children = [];

							let path = "";
							let b = branches[table.name].children;
							folders.forEach(folder => {

								if (path != "") path += "\\";
								path += folder;

								if (folder.trim() == "" || !b) return;

								let i = b.findIndex(n => n.label === folder);
								if (i >= 0) {
									b = b[i].children;
								} else {
									b.push(new ModelChangesItem(
										`${parentId}\\${path}`,
										folder,
										"folder",
										[],
									));
									b = b[b.length - 1].children;
								}
								
							});

							b.push(new ModelChangesItem(
								`${parentId}\\${measure.displayFolder ? `${measure.displayFolder}\\` : ``}${measure.name}`,
								measure.name,
								"measure",
								null,
								measure.isHidden,
								vscode.TreeItemCollapsibleState.None, 
								{ command: "bravo.viewDaxItem", title: "View Measure", arguments: [uri] },
								uri
							));

						} else {
							branches[measure.name] = new ModelChangesItem(
								measure.name,
								measure.name,
								"measure",
								null,
								measure.isHidden,
								vscode.TreeItemCollapsibleState.None, 
								{ command: "bravo.viewDaxItem", title: "View Measure", arguments: [uri] },
								uri
							)
						} 

						if (measure.expression)
							VirtualDocs.instance.add(uri, sanitizeDax(measure.expression));
                    });

					if (tree && !branches[table.name].children.length)
						delete branches[table.name];
                }
            });
        }

        return Object.values(branches);
    }

}

export class ModelChangesItem extends vscode.TreeItem {

	constructor(
		
		public readonly id: string,
		public readonly label: string,
		public readonly icon: string,
		public children?: ModelChangesItem[],
		public readonly isHidden?: boolean,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
		public readonly command?: vscode.Command,
		public readonly uri?: vscode.Uri
	) {
		super(label, collapsibleState);

		this.tooltip = this.label;
	}

	contextValue = (this.isHidden ? "hidden" : "");
	iconPath = new vscode.ThemeIcon(this.icon ? `bravo-${this.icon}` : `blank`, 
		(this.isHidden ? new vscode.ThemeColor("disabledForeground") : null));
}


