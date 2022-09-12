(function () {

    const vscode = acquireVsCodeApi();
    const uri = document.body.dataset["uri"] || "default";
    let state = vscode.getState();
    if (!state) state = {};
    if (!state[uri]) state[uri] = {};

    const toggleGenerating = toggle => {
        let div = document.querySelector(".generating-preview");
        if (!!div == toggle) return;
        if (toggle) {
            div = document.createElement("div");
            div.classList.add("generating-preview");
            div.textContent = "Generating preview...";
            document.body.prepend(div);
        } else {
            div.remove();
        }
    };

    let table = new Tabulator("#preview-table", {
        //renderVertical: "basic",
        height: "100vh",
        layout: "fitData",
        placeholder: `<p><em>No rows found.</em></p>`,
        autoColumns: true,
        initialSort: state[uri].order,
        /*resizableColumnFit: true,
        autoColumnsDefinitions: definitions => {
            definitions.forEach(column => {
                column.resizable = true; 
            });
            return definitions;
        },*/
    });
    table.on("tableBuilt", ()=>{
        toggleGenerating(false);
    });
    table.on("dataSorted", (sorters, rows)=>{
        if (sorters && sorters.length) {
            state[uri].order = [ { column: sorters[0].field, dir: sorters[0].dir } ];
            vscode.setState(state); 
        }
    });
    toggleGenerating(true);
}());