/*!
 * Bravo for Power BI
 * Bravo Template Editor
 * 
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/
import { Utils } from '../helpers/utils';

// Partial English error string taken from Bravo
const errorStrings = {
    errorAborted: "Operation aborted.",
    errorAnalysisServicesConnectionFailed: "A connection problem arises between the server and Bravo.",
    errorConnectionUnsupported: "The connection to the requested resource is not supported.",
    errorDatasetConnectionUnknown: "Unspecified connection.",
    errorDatasetsEmptyListing: "No open reports available.",
    errorDatasetsListing: "Unable to retrieve the list of datasets of Power BI Service.",
    errorManageDateTemplateError: "An exception occurred while executing the DAX template engine.",
    errorNetworkError: "You are not connected to the Internet.",
    errorNone: "Unspecified error.",
    errorNotAuthorized: "You are not authorized to view the specified resource.",
    errorNotConnected: "You are not connected to Power BI - please sign in to proceed.",
    errorNotFound: "Unable to connect to the specified resource.",
    errorReportConnectionUnknown: "Invalid connection.",
    errorReportConnectionUnsupportedAnalysisServicesCompatibilityMode: "Power BI Desktop Analysis Services instance compatibility mode is not PowerBI.",
    errorReportConnectionUnsupportedAnalysisServicesConnectionNotFound: "Power BI Desktop Analysis Services TCP connection not found.",
    errorReportConnectionUnsupportedAnalysisServicesProcessNotFound: "Power BI Desktop Analysis Services instance process not found.", 
    errorReportConnectionUnsupportedConnectionException: "An exception was raised when connecting to the Power BI Desktop Analysis Services instance.",
    errorReportConnectionUnsupportedDatabaseCollectionEmpty: "The Power BI Desktop Analysis Services instance does not contain any databases. Try to connect to the report using the Bravo icon in the External Tools of Power BI Desktop.",
    errorReportConnectionUnsupportedDatabaseCollectionUnexpectedCount: "Power BI Desktop Analysis Services instance contains an unexpected number of databases (> 1) while we expect zero or one.",
    errorReportConnectionUnsupportedProcessNotReady: "Power BI Desktop process is opening or the Analysis Services instance is not yet ready.", 
    errorTimeout: "Request timeout.",
    errorTOMDatabaseDatabaseNotFound: "The database does not exist in the collection or the user does not have administrator rights to access it.",
    errorTOMDatabaseUpdateConflictMeasure: "The requested update conflicts with the current state of the target resource.",
    errorTOMDatabaseUpdateErrorMeasure: "The requested update failed because one or more measures contain errors.", 
    errorTOMDatabaseUpdateFailed: "The database update failed while saving the local changes made to the model on database server.",
    errorUnhandled: "Unhandled error - please report it and provide the trace id, if available.",
    errorUnspecified: "Unspecified error.",
};

export interface ProblemDetails {
    type?: string
    title?:	string
    status?: number
    detail?: string
    instance?: string
    traceId?: string
}

export enum AppProblem {
    None = 0,
    AnalysisServicesConnectionFailed = 10,

    TOMDatabaseDatabaseNotFound = 101,
    TOMDatabaseUpdateFailed = 102,
    TOMDatabaseUpdateConflictMeasure = 103,
    TOMDatabaseUpdateErrorMeasure = 104,
    ConnectionUnsupported = 200,
    UserSettingsSaveError = 300,
    SignInMsalExceptionOccurred = 400,
    SignInMsalTimeoutExpired = 401,
    VpaxFileImportError = 500,
    VpaxFileExportError = 501,
    NetworkError = 600,
    ExportDataFileError = 700,
    ManageDateTemplateError = 800,
}

export enum AppErrorType {
    Managed,
    Response,
    Abort,
    Auth,
    Generic, 
    Fatal
}

export class AppError {

    type: AppErrorType;
    code: number;
    message: string;
    details: string;
    traceId: string;
    readonly requestAborted: boolean;
    readonly requestTimedout: boolean;

    private constructor(type: AppErrorType, message?: string, code?: number, traceId?: string, details?: string) {
        if (!message)
            message = errorStrings.errorUnspecified;

        this.message = message;
        this.details = details;

        this.type = type;
        this.code = code;
        this.requestAborted = (type == AppErrorType.Abort && code == Utils.ResponseStatusCode.Aborted);
        this.requestTimedout = (type == AppErrorType.Abort && code == Utils.ResponseStatusCode.Timeout);

        this.traceId = traceId;
    }

    toString(includeTraceId = true) {

        let message = this.message;
        let details = this.details;

        return `Error${ this.code ? ` ${this.type != AppErrorType.Managed ? "HTTP/" : "" }${ this.code }` : "" }: ${ message }${ details ? `\n${details}` : "" }${ includeTraceId && this.traceId ? `\nTrace Id: ${this.traceId}` : ""}`;
    }

    static InitFromProblem(problem: ProblemDetails, message?: string) {

        let errorType;
        let errorCode;
        let errorMessage;
        let errorDetails;

        let traceId = problem.traceId;

        // 400 (Handled)
        if (problem.status == Utils.ResponseStatusCode.BadRequest) { 
            errorType = AppErrorType.Managed;
            errorCode = Number(problem.instance);
            const key = `error${AppProblem[errorCode]}`;
            errorMessage = (key in errorStrings ? errorStrings[key] : errorStrings.errorUnhandled);
            errorDetails = problem.detail;

        } else {
            errorCode = problem.status;

            // Not authorized
            if (problem.status == Utils.ResponseStatusCode.NotAuthorized) {
                errorType = AppErrorType.Auth;
                errorMessage = errorStrings.errorNotAuthorized;
            
            // Aborted
            } else if (problem.status == Utils.ResponseStatusCode.Aborted) {
                errorType = AppErrorType.Abort;
                errorMessage = errorStrings.errorAborted;

            // Timeout
            } else if (problem.status == Utils.ResponseStatusCode.Timeout) {
                errorType = AppErrorType.Abort;
                errorMessage = errorStrings.errorTimeout;

            // HTTP error (unhandled)
            } else {
                errorType = AppErrorType.Response;
                errorMessage = problem.title ? problem.title : errorStrings.errorUnspecified;
                if (errorMessage.trim().slice(-1) != ".") errorMessage += "."; 
                
                errorDetails = problem.detail;
                
            }
        }

        if (message) errorMessage = message;

        return new AppError(errorType, errorMessage, errorCode, traceId, errorDetails);
    }

    static InitFromProblemCode(code: number, message?: string, details?: string) {
        return AppError.InitFromProblem({ status: Utils.ResponseStatusCode.BadRequest, instance: String(code), detail: details }, message);
    }

    //This error is not generated by the host, so it should be tracked if >= 500
    static InitFromResponseStatus(code: number, message?: string) {

        let problem: ProblemDetails = { status: code };
        if (message) problem.title = message;
        return AppError.InitFromProblem(problem, message);
    }

    static InitFromError(error: Error){
        return AppError.InitFromProblem({ status: Utils.ResponseStatusCode.InternalError, title: error.message });
    }

    static InitFatalError(message?: string) {
        return new AppError(AppErrorType.Fatal, message);
    }
}