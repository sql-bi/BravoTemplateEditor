/**!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import fetch from 'node-fetch';  
import { RequestInit, BodyInit, Response } from 'node-fetch';
import * as vscode from 'vscode';

// Utils
export module Utils {

    export type RequestAbortReason = "user" | "timeout";

    export enum ResponseStatusCode {
        Ok = 200,
        NoContent = 204,
        MultipleChoice = 300,
        BadRequest = 400,
        NotAuthorized = 401,
        Forbidden = 403,
        NotFound = 404,
        Timeout = 408,
        Aborted = 418, // Actual meaning is "I'm a teapot" (April Fool joke)
        InternalError = 500
    }

    export module Request {

        // Send ajax call
        export function ajax(url: string, data = null, options: RequestInit = {}, authorization = "") {

            let defaultOptions: RequestInit = {
                method: "GET", // *GET, POST, PUT, DELETE, etc.
                //mode: "cors", // no-cors, *cors, same-origin
                //cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
                //credentials: "omit", // include, *same-origin, omit
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                redirect: "follow", // manual, *follow, error
                referrerPolicy: "unsafe-url", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            };

            let mergedOptions = {...defaultOptions, ...options};

            if (data && !Utils.Obj.isEmpty(data)) {
                if (mergedOptions.method == "POST") {
                    if ((<any>mergedOptions.headers)["Content-Type"] == "application/json") {
                        mergedOptions.body = JSON.stringify(data);
                    } else {
                        mergedOptions.body = data;
                    }

                } else if (mergedOptions.method == "GET") {

                    // Append data args to the URL
                    try {
                        let _url = new URL(url);
                        _url.search = new URLSearchParams(data).toString();
                        url = _url.href;

                    } catch(e) {}
                }
            }

            if (authorization)
                (<any>mergedOptions.headers)["Authorization"] = authorization; 

            const ajaxHandleResponseStatus = (response: Response) => {
                return (response.status >= ResponseStatusCode.Ok && response.status < ResponseStatusCode.MultipleChoice) ? 
                    Promise.resolve(response) :
                    Promise.reject(response);
            };
            
            const ajaxHandleContentType = (response: Response) => {
                if (response.status == ResponseStatusCode.NoContent) {
                    return Promise.resolve(null);
                } else {
                    const contentType = response.headers.get('content-type');
                    return contentType && contentType.startsWith('application/json') ?
                        response.json() :
                        response.text();
                }
            }

            return fetch(url, mergedOptions) //?
    	        .then(response => ajaxHandleResponseStatus(response))
                .then(response => ajaxHandleContentType(response));
        }

        // Convenience func for GET ajax
        export function get(url: string, data = {}, signal?: any) {
            return Utils.Request.ajax(url, data, { method: "GET", signal: signal });
        }

        // Convenience func for POST ajax
        export function post(url: string, data = {}, signal?: any) {
           return Utils.Request.ajax(url, data, { method: "POST", signal: signal });
        }

        export function upload(url: string, file: any, signal?: any) {
            return Utils.Request.ajax(url, {}, { 
                method: "POST",  
                body: file, 
                signal: signal,
                headers: { }, //Set emtpy - this way the browser will automatically add the Content type header including the Form Boundary
            });
        }

        export function isAbort(error: Error) {
            return (error.name == "AbortError");
        }
    }

    export module Text {

        export function slugify(text: string): string {
            return text.toLowerCase().replace(/\s|\.|\/|\\|_/g, "-").replace(/'|"|#/g, "").replace(/\[|\]/g, '-');
        }

        export function ucfirst(text: string): string {
            return text.substring(0, 1).toUpperCase() + text.substring(1).toLocaleLowerCase();
        }

        export function splinter(text: string, firstBlockLength: number): string[] {
            let firstBlock = text.replace(new RegExp(`^(.{${firstBlockLength}}[^\\s]*).*`), "$1");
            let secondBlock = text.substring(firstBlock.length);
            return [firstBlock, secondBlock];
        }

        export function camelCase(text: string): string {
            return text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
        }

        export function pascalCase(text: string): string {
            let cText = Utils.Text.camelCase(text);
            return cText.substring(0, 1).toUpperCase() + cText.substring(1);
        }

        export function uuid(): string {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
            });
        }

        export function caesarCipher(s: string, k: number = 0, prefix = "---"): string {
            let n = 26; // alphabet letters amount
            if (!k) k = Math.round((Math.random() * 50) + 5);
            if (k < 0) return caesarCipher(s, k + n, prefix);

            return prefix + s.split('')
                .map(c => {
                    if (c.match(/[a-z]/i)) {
                        let code = c.charCodeAt(0);
                        let shift = (code >= 65 && code <= 90 ? 65 : (code >= 97 && code <= 122 ? 97 : 0));
                        return String.fromCharCode(((code - shift + k) % n) + shift);
                    }
                    return c;
                }).join('');
        }
    }

    export module Format {

        export function bytes(value: number, locale = "en", decimals = 2, base = 0): string {
  
            const k = 1024;
            const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

            if (!value) return `0 ${sizes[0]}`;

            let i = Math.floor(Math.log(value) / Math.log(k));
            if (base) {
                for (let l = 0; l < sizes.length; l++) {
                    if (base >= Math.pow(k, l)) {
                        i = l;
                        break;
                    }
                }
            }
            let digits = (i ? decimals : 0);
            let formatter = Intl.NumberFormat(locale, { 
                maximumFractionDigits: digits, 
                minimumFractionDigits: digits 
            });
            let n = formatter.format(value / Math.pow(k, i));
            if (n == "0" && i > 0) n = `<${n}`;
   
            return `${n} ${sizes[i]}`;
        }

        export function percentage(value: number, locale = "en", decimals = 2): string {
            let formatter = Intl.NumberFormat(locale, { 
                style: "percent",
                maximumFractionDigits: decimals, 
                minimumFractionDigits: decimals
            });
            let n = formatter.format(value);
            if (value > 0 && n == "0%") {
                n = `<${1 / Math.pow(10, decimals)}%`;
            }
            return n;
        }

        export function compress(value: number, decimals = 2): string {
            if (!value) return String(value);

            let si = [
              { value: 1, symbol: "" },
              { value: 1E3, symbol: "K" },
              { value: 1E6, symbol: "M" },
              /*{ value: 1E9, symbol: "G" },
              { value: 1E12, symbol: "T" },
              { value: 1E15, symbol: "P" },
              { value: 1E18, symbol: "E" }*/
            ];
            let i;
            for (i = si.length - 1; i > 0; i--) {
              if (value >= si[i].value) {
                break;
              }
            }
            return `${(value / si[i].value).toFixed(i ? decimals : 0)} ${si[i].symbol}`;
        }
    }

    export module Obj {

        // Clone object - memory eager!
        export function clone(obj: any) {
            return JSON.parse(JSON.stringify(obj));
        }

        // Check if object is empty = no properties
        export function isEmpty(obj: any, includeNull = true): boolean {
            for (let prop in obj) {
                if (obj[prop] !== null || includeNull) {
                    return false;
                }
            }
            return true;
        }

        // Check if the object has been set
        export function isSet(obj: any, nullIsOk = false): boolean { 
            return (typeof obj !== "undefined" && (nullIsOk || obj !== null)); 
        }

        // Check object type
        export function is(x: any, what = "Object"): boolean { 
            return Object.prototype.toString.call(x) === `[object ${Utils.Text.ucfirst(what)}]`;
        }
        export function isObject(x: any): boolean {
            return Utils.Obj.is(x, "Object");
        }
        export function isArray(x: any): boolean {
            return Utils.Obj.is(x, "Array");
        }
        export function isFunction(x: any): boolean {
            return Utils.Obj.is(x, "Function");
        }
        export function isDate(x: any): boolean {
            return Utils.Obj.is(x, "Date");
        }
        export function isString(x: any): boolean {
            return Utils.Obj.is(x, "String");
        }
        export function isNumber(x: any): boolean {
            return (!isNaN(Number(x)));
        }
    }

}

export interface Dic<T> {
    [key: string]: T
}


/**
 * Generate a nonce
 */ 
export function nonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Pause execution for passed seconds
 */ 
export function sleep(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 *  Fix JSON.parse errors with unicode characters
 *  @see {@link: https://github.com/nodejs/node-v0.x-archive/issues/1918#issuecomment-2480359}
 */
export function stripBOM(utf8String: string) {
    return utf8String.replace(/^\uFEFF/, "");
}

/**
 * Remove extension from file name
 * The standard `path.parse(fileName).name` remove only the last `.xxx` part from the file name, 
 * leaving any other `.yyy` which is relevant to this extension - indeed we use `aaa.template.json`
 */ 
export function fileNameWithoutExtension(fileName: string) {
    const re = /(.+?)\./;
    let m = re.exec(fileName);
    return (m ? m[1] : fileName);
}