

var inputWindowId;
var screen;

var focusWindow = function () {
	if (inputWindowId) { inputWindowId.value = this.winid; }
};


window.addEventListener('load', function () {

	//	console.log("screen", screen);
	inputWindowId = document.querySelector("#windowId");
	screen = document.querySelector("#screen");

	if (!screen) return;

	// Buttons inside Tool Window
	const btnNew = document.querySelector("#btn-new");
	const btnNewAutoHide = document.querySelector("#btn-new-autohide");

	let newCount = 1;
	const createDemoWindow = (autoHide = false) => {
		if (!screen?.sweScreen) return;
		screen.sweScreen.config = screen.sweScreen.config || {};
		screen.sweScreen.config.dock = screen.sweScreen.config.dock || {};
		screen.sweScreen.config.dock.autoHide = !!autoHide;
		screen.sweScreen.config.dock.trigger = "hover";

		const id = "demo-" + (newCount++);
		screen.sweScreen.createWindow({
			windowId: id,
			windowTitle: "Demo " + id,
			rect: { width: 360, height: 260 },
			type: "html",
			focus: true,
			idDup: "replace",
			startStatus: "normal",
			flags: {
				resizable: true,
				movable: true,
				closable: true,
				minimizable: true,
				maximizable: true
			},
			content: {
				kind: "html",
				value: `<div style="padding:8px; line-height:1.6;">` +
					`<div><b>${id}</b></div>` +
					`<div>Drag me into Host Window to become a child.</div>` +
					`<div>Hold Ctrl at edges to dock. Ctrl + center to undock.</div>` +
					`<div>AutoHide default: ${autoHide}</div>` +
					`</div>`
			}
		});
	};

	btnNew?.addEventListener("click", () => createDemoWindow(false));
	btnNewAutoHide?.addEventListener("click", () => createDemoWindow(true));
});
