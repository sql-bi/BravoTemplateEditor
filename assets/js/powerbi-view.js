(function () {

    const vscode = acquireVsCodeApi();
    
    const browseButton = document.querySelector(".browse");
    if (browseButton)
        browseButton.addEventListener("click", ()=>{
            vscode.postMessage({ type: "browse" });
        });

    const cancelObservingButton = document.querySelector(".cancel-observing");
    if (cancelObservingButton)
        cancelObservingButton.addEventListener("click", ()=>{
            vscode.postMessage({ type: "abort" });
            togglePBIObserving(false);
        });

    const settingsButton = document.querySelector(".goto-setting");
    if (settingsButton)
        settingsButton.addEventListener("click", ()=>{
            vscode.postMessage({ type: "goto-setting" });
        });

    const attachSelect = document.querySelector(".attach");
    if (attachSelect)
        attachSelect.addEventListener("change", e =>{
            vscode.postMessage({ type: "attach", reportId: e.target.value });
        });

    document.addEventListener("click", e => {
        if (e.target) {
            const element = e.target.closest(".refresh");
            if (element)
                vscode.postMessage({ type: "refresh" });
        }
    });

    window.addEventListener("message", event => {
        const message = event.data;
        switch (message.type) {
            case "refresh":

                const reportSelectorElement = document.querySelector(".report-selector");
                const errorMessageElement = document.querySelector(".error-message");
                if (reportSelectorElement && errorMessageElement) {
                    if (message.error) {
                        errorMessageElement.innerHTML = message.error;
                        reportSelectorElement.style.display = "none";
                        errorMessageElement.style.display = "block";

                    } else {
                       
                        const attachSelect = document.querySelector(".attach");
                        if (attachSelect) 
                            attachSelect.innerHTML = `
                                <option value="" ${message.selectedId ? "" : "selected"}>-- Attach to a Power BI report --</option>
                                ${message.reports ? message.reports.map(tuple => `
                                    <option value="${tuple[0]}" ${ message.selectedId == tuple[0] ? "selected" : ""}>${tuple[1]}</option>
                                `).join("") : ""}
                            `;

                        reportSelectorElement.style.display = "block";
                        errorMessageElement.style.display = "none";
                    }
                }
                break;

            case "opening":
                togglePBIObserving(true);
                break;  

            case "doneOpening":
                togglePBIObserving(false);
                break;      
        }
    });

    const togglePBIObserving = toggle => {
        const overlay = document.querySelector(".pbi-observing");
        if (overlay)
            overlay.style.visibility = (toggle ? "visible" : "hidden");

        vscode.setState({ observing: toggle });
    };

    // Check previous state
    const state = vscode.getState();
    if (state && state.observing)
        togglePBIObserving(true);
}());