

var inputWindowId;
var screen;

var focusWindow = function () {
	if (inputWindowId) { inputWindowId.value = this.winid; }
};


window.addEventListener('load', function () {

	//	console.log("screen", screen);
	inputWindowId = document.querySelector("#windowId");
	screen = document.querySelector("#screen");

	if (screen) {
		const screenCtrl = document.querySelector("#screen-ctrl");
		const btns = screenCtrl.querySelectorAll("button");

		if (btns.length > 0) {
			btns.forEach((btn) => {
				btn.addEventListener("pointerdown", (e) => {
					if (btn.id) {
						if (btn.id === "screenResize") {
							testScreenResize();
							return;
						}
						else if (btn.id === "showWinById") {
							screen.sweScreen.showWinById();
						}
						else if (btn.id === "newwwindow7") {
							newwwindow7();
							return;
						}
						const target = btn.getAttribute("target");
						const action = btn.getAttribute("action");
						if (!target || !action) return;
						screen.sweScreen.ctrlWin(target, action);
					}
					else {
						const windowAction = btn.getAttribute("action");
						if (windowAction === "newwindow15") {
							newwindow15();
							return;
						}
						const action = windowAction.replace(/^window/, "").toLowerCase();
						//						console.log("action", action);

						if (action && ["focus", "maximize", "minimize", "close"].includes(action)) {
							const windowId = inputWindowId.value;
							//							console.log("windowId", windowId);
							if (!windowId) { alert("no window-id " + windowId); return; }
							const targetWindow = screen.sweScreen.getWindow(windowId);
							targetWindow.sweWindow.ctrlWin(action);
						}
					}
				});
			});
		}
	}
});

testScreenResize = () => {
	if (screen.sweScreen.scNode.getAttribute("shrink")) {
		screen.sweScreen.scNode.style.setProperty("--width-padding", "200px");
		screen.sweScreen.scNode.removeAttribute("shrink");
	}
	else {
		screen.sweScreen.scNode.style.setProperty("--width-padding", "1000px");
		screen.sweScreen.scNode.setAttribute("shrink", true);
	}
}

newwwindow7 = () => {
	screen.sweScreen.createWindow({
		windowId: "newwwindow7",
		windowTitle: "Fire TV Stickのリモコンがない！",
		rect: { width: 611, height: 600 },
		type: "article",
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
		content: { kind: "url", value: "sample/window_content_7.html" },
		onReady: null,
		onClose: null,
	});
}

newwindow15 = () => {
	const doc = new DOMParser().parseFromString("<div window-id=\"sampleWindow-15\" window-title=\"ここにウィンドウヘッダーのタイトルが入る\" height=\"640\" width=\"911\" top=\"120\" left=\"300\" focus=\"true\" type=\"data\"><img src=\"img/trafficlight.png\" style=\"float:right\" width=\"400px\">ウィンドウマネージャ（Window Manager, WM）とは、GUI（グラフィカルユーザーインターフェース）においてウィンドウの表示（配置、サイズ、外観）、操作（移動、最小化、最大化など）、入力（フォーカス、イベント処理）を管理するソフトウェアです。OSに統合されている場合（Windows、macOSなど）と、X Window Systemのように独立したプログラムとして複数存在し、ユーザーが選んで利用する形式（Linuxなど）があります。 <br>主な役割<br>ウィンドウの管理: 画面上でのウィンドウの重ね順（Zオーダー）、位置、サイズを制御します。<br>視覚効果: ウィンドウの枠（タイトルバー、ボーダー）、透明度（Aeroなど）、アニメーションなどを描画します。<br>ユーザーインタラクション: マウスやキーボードからの入力を受け付け、ウィンドウの操作（ドラッグ、リサイズ、クローズなど）を可能にします。<br>入力フォーカス: どのウィンドウにキーボード入力を送るかを管理します。 <br>種類と例<br>Windows/macOS: OSの機能の一部として「Desktop Window Manager (DWM)」やOSに統合されたWMが動作します。<br>Linux/X Window System: 独立した多様なWMが存在します。<br>スタック型（Floating）: ウィンドウを重ねて配置するタイプ（例: Metacity, Openbox, dwm, cwm）。<br>タイリング型（Tiling）: ウィンドウを隙間なくタイル状に自動配置するタイプ（例: dwm, i3, Awesome）。<br>コンポジティング型（Compositing）: 2D/3D描画やエフェクトを重視するタイプ（Wayland環境ではコンポジタがWMの役割を兼ねる）。 <br>X Window Systemにおける特徴<br>X Window Systemでは、ウィンドウマネージャはアプリケーションとは分離されており、サーバー（Xサーバー）上で動作します。そのため、GNOMEやKDEといったデスクトップ環境の一部として提供されたり、軽量なWMを単独で選んで使用したりすることが可能です。 <br>ウィンドウマネージャは、私たちが日常的に行う「ウィンドウを動かす」「別のアプリに切り替える」といった操作の裏側で、非常に重要な役割を担っているのです</div>", 'text/html');
	const targetNode = doc.body.firstElementChild;

	screen.sweScreen.createWindow(targetNode);
}
