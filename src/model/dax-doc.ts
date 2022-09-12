/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import * as vscode from 'vscode';
import { PBIDesktopReport } from './pbi-report';

/**
 * DAX Doc Scheme
 */ 
export enum DaxDocScheme {
	measure = "dax-measure",
	table = "dax-table"
}

/**
 * DAX Doc types
 */ 
export type DaxDocType = keyof typeof DaxDocScheme;

/**
 * Generate a Dax Doc uri from an entity
 */ 
export function getDaxDocUri(type: DaxDocType, report: PBIDesktopReport, entityName: string) {
	const reportName = (report.serverName && report.databaseName ? `${report.serverName}_${report.databaseName}` : `${report.id}`);

    // Sanitize entity name
	const name = entityName.replace(/\/|\\|#/g, " ").replace(/ {2,}/g, " "); 
    
	return vscode.Uri.parse(`${DaxDocScheme[type]}:${reportName}/${name}`);
}

/**
 * Check if passed uri is a DAX Doc
 */ 
export function isDaxDoc(uri: vscode.Uri) {
	return uri && Object.values(DaxDocScheme).includes(<DaxDocScheme>uri.scheme);
}

/**
 * Check if passed uri is a DAX Table
 */ 
export function isDaxTableDoc(uri: vscode.Uri) {
    return uri && uri.scheme == DaxDocScheme.table;
}

/**
 * Check if passed uri is a DAX Measure
 */ 
export function isDaxMeasureDoc(uri: vscode.Uri) {
    return uri && uri.scheme == DaxDocScheme.measure;
}

/**
 * Remove extra lines from DAX expressions
 */ 
export function sanitizeDax(expression: string) {
	return expression.replace(/^\r?\n/, "");
}