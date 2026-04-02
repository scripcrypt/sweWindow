

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
	const btnNew5 = document.querySelector("#btn-new-5");
	const btnNewAutoHide = document.querySelector("#btn-new-autohide");

	let newCount = 1;
	const createDemoWindow = async (autoHide = false) => {
		if (!screen?.sweScreen) return;
		screen.sweScreen.config = screen.sweScreen.config || {};
		screen.sweScreen.config.dock = screen.sweScreen.config.dock || {};
		const prevAutoHide = screen.sweScreen.config.dock.autoHide;
		screen.sweScreen.config.dock.autoHide = !!autoHide;
		screen.sweScreen.config.dock.trigger = "hover";

		const id = "demo-" + (newCount++);
		await screen.sweScreen.createWindow({
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
				value:
					`<div style="padding:10px; line-height:1.6; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">` +
						`<div style="font-size:14px; font-weight:700; margin-bottom:6px;">${id}</div>` +
						`<div style="opacity:0.9; margin-bottom:10px;">` +
							`This is a demo window created by <b>New Window</b>.` +
						`</div>` +
						`<div style="background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding:10px;">` +
							`<div style="font-weight:700; margin-bottom:6px;">How to test</div>` +
							`<div>1) Drag into <b>Host Window</b> to make it a child.</div>` +
							`<div>2) Hold <b>Ctrl</b> and drop at an edge to dock (left/right/top/bottom).</div>` +
							`<div>3) Hold <b>Ctrl</b> and drop toward center to undock.</div>` +
							`<div style="margin-top:8px; opacity:0.9;">` +
								`Docking rule: <b>one window per side band</b>.` +
								` Nested child windows are allowed inside a docked window.` +
							`</div>` +
						`</div>` +
						`<div style="margin-top:10px; opacity:0.85;">AutoHide default: <b>${autoHide}</b></div>` +
					`</div>`
			}
		});
		screen.sweScreen.config.dock.autoHide = prevAutoHide;
	};

	btnNew?.addEventListener("click", () => createDemoWindow(false));
	btnNew5?.addEventListener("click", () => {
		for (let i = 0; i < 5; i++) createDemoWindow(false);
	});
	btnNewAutoHide?.addEventListener("click", () => createDemoWindow(true));
});
