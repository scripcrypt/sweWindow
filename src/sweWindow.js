




class sweScreen {

	scNode;	// Screen Node
	config;
	windows = [];
	winds = {};
	winById = new Map()
	rectSlide = 50;
	initBuild = false;
	attributes = ["window-title", "type", "resizable", "movable", "closable", "minimizable", "maximizable", "min-width", "min-height", "url", "html"];
	_num(v) {
		return (v == null || v === "") ? null : Number(v);
	};

	DEFAULT_CONFIG = {
		rect: { top: 80, left: 80, width: 300, height: 300 },
		type: "html",
		minSize: { width: 200, height: 200 },
		focus: false, // true | false
		idDup: "error", // "error" | "replace"
		startStatus: "normal",   // "normal" | "maximize" | "minimize"
		flags: {
			resizable: true,
			movable: true,
			closable: true,
			minimizable: true,
			maximizable: true
		}
	};


	/*--------------------------------------------------
		コンストラクタ
	--------------------------------------------------*/
	constructor(screen = null, config = null) {

		this.scNode = typeof screen === "string"
			? document.querySelector(screen)
			: (screen === null ? document.body : screen);

		//		this.configMerge = this.mergeConfig;
		this.configMerge = this.objectMerge;

		this.ready = (async () => {
			await this.buildAllWindows(config);
			this.initBuild = true;
			return this;
		})();

	}



	buildAllWindows = (config) => {
		//		this.config = this.configMerge(this.DEFAULT_CONFIG, config);
		this.config = this.configMerge(this.DEFAULT_CONFIG, config);
		//console.log("Screen Config", JSON.stringify(this.config));

		// scNode がまともなノードじゃなければ何もしない
		if (!this.scNode || this.scNode.nodeType !== 1) return;

		this.scNode.classList.add("invisible");
		this.scNode.sweScreen = this;

		// .sweTaskbar がなければ作る
		if (!this.scNode.querySelector(".sweTaskbar")) {
			this.tbNode = document.createElement("div");
			this.tbNode.classList.add("sweTaskbar");
			this.scNode.append(this.tbNode);
		}

		// sweWindow を集める
		const wds = this.scNode.querySelectorAll(":scope > .sweWindow");
		if (!wds.length) {
			this.scNode.classList.remove("invisible"); // 一応戻しておくなら
			return;
		}

		this.openWindows(wds);
	}


	openWindows = (wds = null) => {
		if (!wds) return;

		// NodeList → 配列 にして map
		let focus;
		Promise.all(
			[...wds].map(async (sww) => {
				await this.buildWindow(sww);
			})
		).then(instances => {
			this.scNode.classList.remove("invisible");
			if ((typeof focus === "Boolean" && focus) || (typeof focus === "string" && focus === "true")) {
				focus.sweWindow.bringToFront();
			}
			else {
				this.windows[this.windows.length - 1].bringToFront();
			}
		});

		this.resizeScreenEvent();
	};



	buildWindow = (sww) => {
		//		console.log(sww);
		const parsedConfig = this._parseWindowDecl(sww);
		if (parsedConfig) {
			//const config = this.configMerge(this.config, parsedConfig);
			const config = this.configMerge(this.config, parsedConfig);
			if (config.focus) { focus = sww; }
			const wn = this.windows.length;
			sww.sweWindow = new sweWindow(sww, this, wn);
			this.registerWindow(sww.sweWindow, config.windowId);
			return sww.sweWindow.init(config);
		}
	}


	/**
	 * 
	 */
	_parseWindowDecl = (sww) => {
		const windowId = this._resolveWindowId(sww);
		if (!windowId) { return; }

		const windowTitle = sww.getAttribute("window-title") || "";

		const rect = this._resolveAttributeRect(sww);

		const type = sww.getAttribute("type") || this.config.type;
		const startStatus = sww.getAttribute("start-status") || this.config.startStatus;
		const focus = sww.getAttribute("focus") || this.config.focus;

		const bool = (name, def = true) => {
			const v = sww.getAttribute(name);
			if (v == null) return def;
			return v !== "false";
		};

		const flags = {
			resizable: bool("resizable", this.config.resizable),
			movable: bool("movable", this.config.movable),
			closable: bool("closable", this.config.closable),
			minimizable: bool("minimizable", this.config.minimizable),
			maximizable: bool("maximizable", this.config.maximizable),
		};

		const minSize = {
			width: this._num(sww.getAttribute("min-width")) ?? this.config.minSize.width,
			height: this._num(sww.getAttribute("min-height")) ?? this.config.minSize.height
		};

		const url = sww.getAttribute("url");
		const html = sww.getAttribute("html");
		let content = null;

		if (url) content = { kind: "url", value: url };
		else if (html) content = { kind: "html", value: html };
		else content = { kind: "node", value: sww };

		this._removeAttributes(sww);

		return { windowId, windowTitle, rect, type, minSize, focus, startStatus, flags, content };
	};


	/**
	 * 
	 * @param {*} sww 
	 * @returns 
	 */
	_removeAttributes = (sww) => {
		for (let attr of this.attributes) {
			sww.removeAttribute(attr);
		}
	}


	/**
	 * 
	 */
	_resolveAttributeRect = (sww) => {

		const rect = {
			top: this._num(sww.getAttribute("top")),
			left: this._num(sww.getAttribute("left")),
			width: this._num(sww.getAttribute("width")),
			height: this._num(sww.getAttribute("height")),
		};

		return this._resolveRect(rect);
	}


	_resolveRect = (rect) => {
		let rc = false;
		if (!rect.top) {
			rect.top = this.config.rect.top + this.rectSlide;
			rc = true;
		}
		if (!rect.left) {
			rect.left = this.config.rect.left + this.rectSlide;
			rc = true;
		}
		if (rc) {
			this.rectSlide += 50;
			//console.log("this.rectSlide", this.rectSlide);
		}
		if (!rect.width || rect.width < this.config.minSize.width) {
			rect.width = this.config.minSize.width;
		}
		if (!rect.height || rect.height < this.config.minSize.height) {
			rect.height = this.config.minSize.height;
		}
		return rect;
	}


	/**
	 * 
	*/
	_resolveWindowId(sww) {
		let id;
		if (sww.getAttribute("window-id")) {
			id = sww.getAttribute("window-id");
		}
		else {
			id = "win-" + crypto.randomUUID();
		}

		id = this._resolveDupWindowId(id);

		return id;
	}


	_resolveDupWindowId = (id, idDup = null) => {
		//console.log("this.winById.id", id);
		//console.log("this.winById.has.id", this.winById.has(id));
		idDup = idDup ?? this.config.idDup;
		//console.log("idDup", idDup);
		// ID重複
		if (this.winById.has(id)) {
			//console.log("idDup", this.config.idDup);
			switch (idDup) {
				case "replace":
					const old = this.winById.get(id);
					//console.log(id, old);
					this.closeWin(old);
					break;
				case "newid":
					id = "win-" + crypto.randomUUID();
					break;
				case "error":
				default:
					console.error(`[sweScreen] duplicated window-id: ${id}`);
					return null;
					break;
			}
		}

		return id;
	};



	/*--------------------------------------------------
		Get Window Instance by Id
	--------------------------------------------------*/
	getWindowInstance(id) {
		return this.winById.get(id) || null;
	}



	/*--------------------------------------------------
		Get Window by Id
	--------------------------------------------------*/
	getWindow(id) {
		return this.winById.get(id).frNode || null;
	}


	/*--------------------------------------------------
		Attach Screen Resize Event
	--------------------------------------------------*/
	resizeScreenEvent = () => {
		const observer = new ResizeObserver(this.__resizeCallback);
		observer.observe(this.scNode);
	};


	__resizeCallback = (win) => {
		const taskbarHeight = this.tbNode.offsetHeight ?? 0;
		this.scNode.style.setProperty("--taskbar-height", taskbarHeight + "px");
	};


	/*--------------------------------------------------
		Register Window
	--------------------------------------------------*/
	registerWindow(win, id) {
		this.windows.push(win);
		this.winById.set(id, win);
	}



	/*--------------------------------------------------
		Reorder Z-index
	--------------------------------------------------*/
	reorderZ(win = null, focus = true) {

		// ---- 引数なし：詰めるだけ（順番は変えない）----
		if (!win) {
			const last = this.windows.length - 1;
			for (let i = last; i >= 0; i--) {
				this.windows[i].setZindex(i);
			}
			return;
		}

		const from = this.windows.indexOf(win);
		if (from < 0) return;

		const last = this.windows.length - 1;
		if (from === last) return; // 既に最前面

		// 1) 配列の順番入れ替え：active を末尾へ
		this.windows.splice(from, 1);
		this.windows.push(win);

		// 2) z-index 更新：影響範囲は from..last（大→小で更新）
		for (let i = last; i >= from; i--) {
			this.windows[i].setZindex(i);
		}

		// 最前面化（必要なら）
		if (focus) { this.windows[last].bringToFront?.(); console.log("HEN"); }

	}



	/*--------------------------------------------------
		Window Controll
	--------------------------------------------------*/
	ctrlWin = (target = null, action = null) => {
		if (!target || !action) return;

		const wininst = this.getWindowInstance(target);

		if (wininst) {
			switch (action) {
				case "focus":
					wininst.bringToFront();
					break;
				case "maximize":
					wininst.resizeWindow("maximize");
					break;
				case "minimize":
					wininst.resizeWindow("minimize");
					break;
				case "close":
					this.closeWin(wininst);
			}
		}
	};


	/*----------------------------------------------------
		Close Window
	----------------------------------------------------*/
	closeWin = (win = null) => {
		if (!win) return;
		win.closeWindow().then(p => {
			//console.log("win", win);
			this.unregisterWindow(win);

			setTimeout(() => {
				if (win.frNode.classList.contains("closing")) {
					//console.log("windows", this.windows);
					//console.log("winById", this.winById);
				}
			}, 1000);
		});

	}


	/*----------------------------------------------------
		UnRegister Window
	----------------------------------------------------*/
	unregisterWindow(win) {
		this.winById.delete(win.id);
		const i = this.windows.indexOf(win);
		if (i >= 0) this.windows.splice(i, 1);
		this.reorderZ();
	}


	/*----------------------------------------------------
		UnRegister Window
	----------------------------------------------------*/
	createWindow = async (opts = null) => {
		if (!opts) {
			this.buildAllWindows();
			return;
		}

		if (opts instanceof Element) {
			await this.buildWindow(opts);
			return;
		}

		opts.windowId = this._resolveDupWindowId(opts.windowId, opts.idDup);
		if (!opts.windowId) return;

		const sww = document.createElement("div");
		sww.classList.add("sweWindow");
		this.scNode.append(sww);
		//console.log("rect1", JSON.stringify(opts.rect));
		opts.rect = this._resolveRect(opts.rect);
		//console.log("rect2", JSON.stringify(opts.rect));
		const config = this.configMerge(this.config, opts);
		//console.log("config", JSON.stringify(config));
		const wn = this.windows.length;
		sww.sweWindow = new sweWindow(sww, this, wn);
		this.registerWindow(sww.sweWindow, config.windowId);
		config.startAnimation = true;
		await sww.sweWindow.init(config);
		if (config.focus) {
			sww.sweWindow.bringToFront();
		}
	}


	mergeConfig = (target, source) => {
		if (typeof target !== 'object' || target === null || Array.isArray(target)) {
			return source;
		}
		if (typeof source !== 'object' || source === null || Array.isArray(source)) {
			return source;
		}

		const output = structuredClone(target);

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = output[key];

			if (
				typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue) &&
				typeof targetValue === 'object' && targetValue !== null && !Array.isArray(targetValue)
			) {
				output[key] = this.mergeConfig(targetValue, sourceValue);
			} else {
				output[key] = sourceValue;
			}
		}

		return output;
	}



	objectMerge(...sources) {
		const isPlainObject = (v) => {
			if (v === null || typeof v !== "object") return false;
			const proto = Object.getPrototypeOf(v);
			return proto === Object.prototype || proto === null;
		};

		const cloneValue = (v) => {
			if (Array.isArray(v)) return v.map(cloneValue);
			if (isPlainObject(v)) {
				const out = {};
				for (const k of Reflect.ownKeys(v)) out[k] = cloneValue(v[k]);
				return out;
			}
			// 関数、DOM、Date、Map、Set、クラスインスタンス等は参照のまま
			return v;
		};

		const mergeInto = (dst, src) => {
			if (src == null) return dst;

			for (const key of Reflect.ownKeys(src)) {
				const sVal = src[key];
				const dVal = dst[key];

				if (isPlainObject(dVal) && isPlainObject(sVal)) {
					// 両方 plain object → 再帰
					dst[key] = mergeInto(dVal, sVal);
				} else if (Array.isArray(sVal)) {
					// 配列は上書き（deep copy）
					dst[key] = sVal.map(cloneValue);
				} else if (isPlainObject(sVal)) {
					// plain object は deep copy を入れる（参照残しを避ける）
					dst[key] = cloneValue(sVal);
				} else {
					// それ以外は参照のまま上書き
					dst[key] = sVal;
				}
			}
			return dst;
		};

		let out = {};
		for (const src of sources) {
			if (src == null) continue;

			// src が plain object じゃないのを混ぜるのは事故りやすいので無視（必要ならここは方針変更）
			if (!isPlainObject(src)) continue;

			out = mergeInto(out, src);
		}
		return out;
	}



	showWinById = (id = null) => {
		if (!id) {
			for (const [key, value] of this.winById) {
				this._showWinById(key);
			}
		}
		else {
			this._showWinById(id);
		}
	}


	_showWinById = (id = null) => {
		if (!this.winById.has(id)) return;

		//console.log(id, this.winById.get(id).title);

	}



}










class sweWindow {

	wdNode;	// Window Node
	frNode;	// Frame Node
	frZ;	// Z index of frameNode
	hdNode;	// Header Node
	tbNode;	// Task Bar Node
	twNode;	// Task Bar Window Node
	scNode;	// Screen Node
	scInst;	// Screen Class Instance
	animationSpeed = 100;	// msec
	minimizeSize = 200;	// px
	rect = {};
	lastStat;
	justFocused;
	winid;


	/*--------------------------------------------------
		コンストラクタ
	--------------------------------------------------*/
	constructor(input, scInst, frZ) {

		this.wdNode = input;
		this.scInst = scInst;
		this.frZ = frZ;
		this.scNode = this.scInst.scNode;
		this.tbNode = this.scNode.querySelector(".sweTaskbar");

	}


	/*--------------------------------------------------
		初期化
	--------------------------------------------------*/
	async init(config) {
		const jsonString = JSON.stringify(config, (key, value) => {
			if (value === config) {
				return undefined; // 自分自身を参照している場合はundefinedを返す
			}
			return value;
		});

		// コンフィグ展開
		this.parseConfig(config);

		// フレームで囲む
		await this.attachFrame();

		// ヘッダーを付加する
		this.addHeader();

		// タスクバーに追加
		this.add2taskbar();

		// サイズを整える
		this.setInitialSize();

		// 位置を揃える
		this.setInitialPos();

		// 不要な属性を削除する
		this.removeWdAttr();

		// イベントをアタッチする
		this.attachEvents();

		// リサイズパーツの追加
		this.addResizeParts();

		// コンテンツの高さ調整
		this.adjust_wdNode_height();

		// bringToFront ?
		//		this.activateToByConfig();

		this.frNode.sweWindow = this;

		// onReady
		setTimeout(() => {
			if (this.onReady) { this.onReady(this); }
		}, 300);

		return this;

	}



	/*--------------------------------------------------
		フレームで囲む
	--------------------------------------------------*/
	attachFrame = async () => {

		this.frNode = document.createElement("div");
		this.frNode.classList.add("sweWindowFrame");

		//		this.wdNode.parentNode.insertBefore(this.frNode, this.wdNode);
		this.frNode.append(this.wdNode);
		this.scNode.append(this.frNode);

		if (this.startAnimation) {
			if (this?.startAnimation) {
				requestAnimationFrame(() => {
					this.frNode.classList.add("openAnim");
				});
			}
			this.frNode.addEventListener("animationend", (e) => {
				if (e.target !== this.frNode) return;
				this.frNode.classList.remove("openAnim");
			}, { once: true });
		}

		// URLコンテンツ
		if (this.content.kind === "url") {
			await this.getURLcontent();
		}

		// Type を設定する
		if (this.type) {
			this.frNode.setAttribute("window-type", this.type);
		}

		// window-id を付加
		this.frNode.setAttribute("window-id", this.winid);
		this.wdNode.removeAttribute("window-id");
		this.wdNode.classList.add("sweWindow");

		// Z-index の設定
		this.setZindex();

	};



	async startOpenAnimation() {
		if (!this.frNode) return;

		// 既にmin/maxアニメ中なら邪魔しない
		if (this.frNode.classList.contains("maximizeAnim") || this.frNode.classList.contains("minimizeAnim")) return;

		this.frNode.classList.add("openAnim");

		await new Promise((resolve) => {
			const done = () => {
				this.frNode.classList.remove("openAnim");
				resolve();
			};
			this.frNode.addEventListener("animationend", (e) => {
				if (e.target !== fr) return;
				done();
			}, { once: true });

			// 保険
			setTimeout(done, 250);
		});
	}



	/*--------------------------------------------------
		フレームで囲む
	--------------------------------------------------*/
	parseConfig = (config) => {
		this.content = config.content;
		this.flags = config.flags;
		this.minSize = config.minSize;
		this.rect = config.rect;
		this.startStatus = config.startStatus;
		this.type = config.type;
		this.focus = config.focus;
		this.winid = config.windowId;
		this.title = config.windowTitle;
		this.startAnimation = config.startAnimation;

		this.onReady = config?.onReady;
		this.onClose = config?.onClose;
		this.onFocus = config?.onFocus;
		this.onMaximize = config?.onMaximize;
		this.onMUnaximize = config?.onMUnaximize;
		this.onMinimize = config?.onMinimize;
		this.onUnMinimize = config?.onUnMinimize;
		this.onMoveStart = config?.onMoveStart;
		this.onMoveEnd = config?.onMoveEnd;
	}



	/*--------------------------------------------------
		Z-index の設定
	--------------------------------------------------*/
	setZindex = (z = null) => {

		this.frZ = !z ? this.frZ : z;
		this.frNode.style.zIndex = String(this.frZ);

	};



	/*--------------------------------------------------
		URLでコンテンツを持ってくる
	--------------------------------------------------*/
	getURLcontent = async () => {

		const url = this.content.value;

		try {
			const response = await fetch(url); // file.htmlへのリクエスト
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const htmlText = await response.text(); // レスポンスをテキストとして取得
			this.wdNode.innerHTML = htmlText;

		} catch (error) {
			console.error("ファイルの読み込みに失敗しました:", error);
		}

	};



	/*--------------------------------------------------
		ヘッダーを付加する
	--------------------------------------------------*/
	addHeader = () => {

		// ヘッダーの生成
		this.hdNode = document.createElement("div");
		this.hdNode.classList.add("sweWindowHeader");

		// ヘッダータイトルの設定
		this.addTitleHeader();

		// コントロールボタンの追加
		this.attachControlButtons();

		// ヘッダーレンダリング
		this.frNode.prepend(this.hdNode);

		// ヘッダー分ウィンドウを下げる
		this.wdNode.style.top = this.hdNode.offsetHeight + "px";

	};



	/*--------------------------------------------------
		サイズを整える
	--------------------------------------------------*/
	setInitialSize = () => {

		const styles = window.getComputedStyle(this.wdNode);

		// 高さ
		if (this.rect.height) {
			const height = parseInt(this.rect.height);
			this.wdNode.style.height = height + (parseInt(styles.paddingTop) + parseInt(styles.paddingBottom)) + "px";
		} else {
			this.wdNode.style.height = this.frNode.style.height;
		}
		this.frNode.style.height = parseInt(this.wdNode.offsetHeight) + parseInt(this.hdNode.offsetHeight) + "px";

		// 幅
		if (this.rect.width) {
			const width = parseInt(this.rect.width);
			this.wdNode.style.width = width + (parseInt(styles.paddingLeft) + parseInt(styles.paddingRight)) + "px";
		} else {
			this.wdNode.style.width = "100%";
		}
		this.frNode.style.width = this.wdNode.offsetWidth + 2 + "px";

	}



	/*--------------------------------------------------
		位置を揃える
	--------------------------------------------------*/
	setInitialPos = () => {

		const wdRect = this.wdNode.getBoundingClientRect();

		// 高さ：　設定あり
		if (!this.rect.top) {
			this.rect.top = wdRect.top + "px";
		}
		this.frNode.style.top = this.rect.top + "px";

		// 左から：　設定あり
		if (!this.rect.left) {
			this.rect.left = wdRect.left + "px";
		}
		this.frNode.style.left = this.rect.left + "px";


		this.setCurrentrect();
		this.dropWdNodeStypes();

	}



	/*--------------------------------------------------
		内部ウィンドウの規定サイズやポジションを削除する
	--------------------------------------------------*/
	dropWdNodeStypes = () => {
		this.wdNode.style.height = null;
		this.wdNode.style.width = null;
		this.wdNode.style.top = null;
		this.wdNode.style.bottom = null;
		this.wdNode.style.left = null;
		this.wdNode.style.right = null;
	}



	/*--------------------------------------------------
		内部ウィンドウの規定サイズやポジションを取得する
	--------------------------------------------------*/
	setCurrentrect = () => {
		if (!this.frNode.style.height || !this.frNode.style.width || !this.frNode.style.top || !this.frNode.style.left) return;

		// ウィンドウのサイズ
		this.rect = {
			height: parseInt(this.frNode.style.height),
			width: parseInt(this.frNode.style.width),
			top: parseInt(this.frNode.style.top),
			left: parseInt(this.frNode.style.left)
		};

	};


	/*--------------------------------------------------
		Remove Style (top, left, width, height)
	--------------------------------------------------*/
	removeStyle = () => {

		// inline の位置/サイズを消す → CSS が効くようになる
		this.frNode.style.top = "";
		this.frNode.style.left = "";
		this.frNode.style.width = "";
		this.frNode.style.height = "";

	}


	/*--------------------------------------------------
		Bring Back Style (top, left, width, height)
	--------------------------------------------------*/
	bringbackStyle = () => {

		//console.log("rect", this.rect);
		// 位置とサイズを戻す
		this.frNode.style.top = this.rect.top + "px";
		this.frNode.style.left = this.rect.left + "px";
		this.frNode.style.width = this.rect.width + "px";
		this.frNode.style.height = this.rect.height + "px";

	}



	/*--------------------------------------------------
		不要な属性を削除する
	--------------------------------------------------*/
	removeWdAttr = () => {

		this.wdNode.removeAttribute("window-title");
		this.wdNode.removeAttribute("top");
		this.wdNode.removeAttribute("left");
		this.wdNode.removeAttribute("height");
		this.wdNode.removeAttribute("width");
		this.wdNode.removeAttribute("url");
		this.wdNode.removeAttribute("type");

	}



	/*--------------------------------------------------
		ヘッダータイトルの設定
	--------------------------------------------------*/
	addTitleHeader = () => {

		const headerTitle = document.createElement("div");
		headerTitle.classList.add("sweWindowHeaderTitle");
		headerTitle.textContent = this.title ?? "no-title";

		this.hdNode.append(headerTitle);

	}



	/*--------------------------------------------------
		コントロールボタンの追加
	--------------------------------------------------*/
	attachControlButtons = () => {

		const headerButtons = document.createElement("div");
		headerButtons.classList.add("sweWindowHeaderButtons");

		// Minimize
		const minimizeButton = document.createElement("button");
		minimizeButton.classList.add("minimize");

		// Maximize
		const maximizeButton = document.createElement("button");
		maximizeButton.classList.add("maximize");

		// Close
		const closeButton = document.createElement("button");
		closeButton.classList.add("close");

		headerButtons.append(minimizeButton);
		headerButtons.append(maximizeButton);
		headerButtons.append(closeButton);

		this.hdNode.append(headerButtons);

	};



	/*--------------------------------------------------
		タスクバーに
	--------------------------------------------------*/
	add2taskbar = () => {
		//console.log("add2taskbar");
		const titleNode = this.hdNode.querySelector(".sweWindowHeaderTitle");
		this.twNode = document.createElement("button");
		this.twNode.classList.add("sweTaskButton");
		this.twNode.innerHTML = titleNode.innerHTML;
		this.twNode.setAttribute("type", this.type);
		this.tbNode.append(this.twNode);

	}


	/*--------------------------------------------------
		Activate
	--------------------------------------------------*/
	activateToByConfig = () => {

		if ((typeof this.focus === "Boolean" && this.focus) || (typeof this.focus === "string" && this.focus === "true")) {
			this.bringToFront();
		}

	}

















	/*=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
	
		Resize Window
	
	=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/

	/*--------------------------------------------------
		イベントをアタッチする
	--------------------------------------------------*/
	attachEvents = () => {

		// windowを前面に出す
		this.activateWindowEvent();

		// windowを動かす
		this.moveWindow();

		// 最大化・最小化・閉じるボタン
		this.windowControllButton();

		// ヘッダーダブルクリックに maximize button を押した時の挙動
		this.headerDoubleClick();

		// タスクバーボタン
		this.taskbarButton();

	};



	/*--------------------------------------------------
		最大化・最小化・閉じるボタン
	--------------------------------------------------*/
	windowControllButton = () => {

		this.hdNode.querySelector(".minimize").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.resizeWindow("minimize");
		});

		this.hdNode.querySelector(".maximize").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.resizeWindow("maximize");
		});

		this.hdNode.querySelector(".close").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.closeWindow();
		});

	};



	/*--------------------------------------------------
		外部からのコントロール
	--------------------------------------------------*/
	ctrlWin = (action = null) => {
		//console.log("ctrlWin", action);
		if (!action || !["focus", "maximize", "minimize", "close"].includes(action)) return;

		if (action === "focus") { this.bringToFront(); }
		else {
			this.resizeWindow(action);
		}

	};



	/*--------------------------------------------------
		ヘッダーダブルクリックに maximize button を押した時の挙動
	--------------------------------------------------*/
	headerDoubleClick = () => {

		this.hdNode.addEventListener("dblclick", (e) => {
			e.preventDefault();
			e.stopPropagation();

			//			this.bringToFront();

			this.resizeWindow("maximize");
		});

	};



	/*--------------------------------------------------
		タスクバーボタン
	--------------------------------------------------*/
	taskbarButton = () => {

		let resizeFrom;
		let resizeTo;

		this.twNode.addEventListener("pointerdown", (e) => {
			//			console.log(e);
			e.preventDefault();
			e.stopPropagation();

			if (this.frNode.classList.contains("minimize")) {
				resizeFrom = "minimize";
				resizeTo = this.lastStat === "maximize" ? "maximize" : "normal";
			}
			else {
				if (this.onFocus) {
					this.onFocus.call(this, this);
					//console.log("this.onFocus", this.onFocus);
				}
				if (this.frNode.classList.contains("maximize")) {
					if (this.frNode.classList.contains("active")) {
						resizeFrom = "maximize";
						resizeTo = "minimize";
					}
					else {
						this.bringToFront();
						return;
					}
				}
				else {
					if (this.frNode.classList.contains("active")) {
						resizeFrom = "normal";
						resizeTo = "minimize";
					}
					else {
						this.bringToFront();
						return;
					}
				}
			}

			const resizeMethod = resizeFrom + "2" + resizeTo;
			this[resizeMethod]();

		});

	};



	/*--------------------------------------------------
		windowを前面に出す
	--------------------------------------------------*/
	activateWindowEvent = () => {

		this.frNode.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.onFocus) {
				this.onFocus.call(this, this);
				//console.log("this.onFocus", this.onFocus);
			}
			this.bringToFront();
		});

	}


	/*--------------------------------------------------
		ウィンドウを前面に出す　
	--------------------------------------------------*/
	bringToFront = () => {
		this.frNode.parentNode.querySelectorAll(".sweWindowFrame.active").forEach((swf) => {
			if (swf !== this.frNode) {
				swf.classList.remove("active");
				const twNode = swf.closest(".sweWindowFrame").querySelector(".sweWindow").sweWindow.twNode;
				twNode.classList.remove("active");
			}
		});
		this.frNode.classList.add("active");
		this.twNode.classList.add("active");

		this.scInst.reorderZ(this, false);

	};


	/*--------------------------------------------------
		Maximize / Minimize
	--------------------------------------------------*/
	resizeWindow = async (resizeTo) => {

		let resizeFrom;
		//console.log("resizeWindow", resizeTo);

		if (resizeTo === "close") {
			await this.closeWindow();
			return;
		}
		else if (this.frNode.classList.contains("maximize")) {
			if (resizeTo === "maximize") { resizeTo = "normal"; }
			resizeFrom = "maximize";
		}
		else if (this.frNode.classList.contains("minimize")) {
			if (resizeTo === "minimize") { resizeTo = this.lastStat ? this.lastStat : "normal"; }
			resizeFrom = "minimize";
		}
		else {
			resizeFrom = "normal";
		}

		const resizeMethod = resizeFrom + "2" + resizeTo;

		const fn = this[resizeMethod];
		if (typeof fn !== "function") {
			console.warn("missing resize method:", resizeMethod);
			return;
		}

		// ★Promiseを返すなら待つ（返さないなら即時でもOK）
		await fn.call(this);

	};



	/*-------------------------------------------------
		コンテントウィンドウの高さを揃える
	-------------------------------------------------*/
	adjust_wdNode_height = () => {
		if (
			this.frNode.classList.contains("maximizeAnim") ||
			this.frNode.classList.contains("minimizeAnim")
		) return;

		const h = this.frNode.clientHeight - this.hdNode.offsetHeight;
		if (h > 0) {
			this.wdNode.style.height = h + "px";
		}
	};





	/*-------------------------------------------------
		Normal to Minimize
	-------------------------------------------------*/
	normal2minimize = () => {

		this.bringToFront();

		if (!this.twNode) return;

		this.lastStat = "normal";
		const brect = this.twNode.getBoundingClientRect();

		const dx = (brect.left + brect.width / 2) - (this.rect.left + this.rect.width / 2);
		const dy = (brect.top + brect.height / 2) - (this.rect.top + this.rect.height / 2);

		this.frNode.style.setProperty("--min-dx", dx + "px");
		this.frNode.style.setProperty("--min-dy", dy + "px");

		this.frNode.classList.add("minimizeAnim");

		this.frNode.addEventListener("animationend", () => {
			this.frNode.classList.add("minimize");
			this.frNode.classList.remove("minimizeAnim");
			this.frNode.style.removeProperty("--min-dx");
			this.frNode.style.removeProperty("--min-dy");
			this.frNode.style.display = "none";
			if (this.onMinimize) { this.onMinimize(this); }
		}, { once: true });

	};


	/*--------------------------------------------------
		Normal to Maximize
	--------------------------------------------------*/
	normal2maximize = () => {

		this.bringToFront();

		const taskbarHeight = this.tbNode.offsetHeight ?? 0;

		this.lastStat = "normal";
		this.frNode.style.setProperty("--from-top", this.rect.top + "px");
		this.frNode.style.setProperty("--from-left", this.rect.left + "px");
		this.frNode.style.setProperty("--from-width", this.rect.width + "px");
		this.frNode.style.setProperty("--from-height", this.rect.height + "px");
		this.scNode.style.setProperty("--taskbar-height", taskbarHeight + "px");

		// 最大化の状態フラグ
		this.frNode.classList.add("maximize");
		this.frNode.classList.add("maximizeAnim");

		this.frNode.addEventListener("animationend", () => {
			this.wdNode.style.height = "";
			this.removeStyle();
			this.frNode.classList.remove("maximizeAnim");
			this.frNode.style.removeProperty("--from-top");
			this.frNode.style.removeProperty("--from-left");
			this.frNode.style.removeProperty("--from-width");
			this.frNode.style.removeProperty("--from-height");
			this.frNode.style.removeProperty("--to-height");
			if (this.onMaximize) { this.onMaximize(this); }
		}, { once: true });

	};


	/*--------------------------------------------------
		Minimize to Normal
	--------------------------------------------------*/
	minimize2normal = () => {

		if (!this.twNode || !this.rect) return;

		this.frNode.style.display = "block";

		this.lastStat = "minimize";
		const brect = this.twNode.getBoundingClientRect();

		this.frNode.style.transform = "none";
		this.frNode.style.opacity = "0";

		this.bringbackStyle();

		const dx = (brect.left + brect.width / 2) - (this.rect.left + this.rect.width / 2);
		const dy = (brect.top + brect.height / 2) - (this.rect.top + this.rect.height / 2);
		//console.log("minimize2normal dx", dx);
		//console.log("minimize2normal dy", dy);

		this.frNode.style.setProperty("--restore-dx", dx + "px");
		this.frNode.style.setProperty("--restore-dy", dy + "px");

		// アニメ class を追加
		this.frNode.classList.add("restoreAnim");

		this.frNode.addEventListener("animationend", () => {

			// アニメ終了で transform解除
			this.frNode.style.transform = "";
			this.frNode.style.opacity = "";

			this.frNode.classList.remove("restoreAnim");
			this.frNode.classList.remove("minimize");

			this.bringToFront();

			if (this.onUnMinimize) { this.onUnMinimize(this); }
		}, { once: true });

	};


	/*--------------------------------------------------
		Maximize to Minimize
	--------------------------------------------------*/
	maximize2minimize = () => {

		if (!this.twNode) return;

		// 最大化中でも前面に
		this.bringToFront();

		this.lastStat = "maximize";
		const brect = this.twNode.getBoundingClientRect();

		// タスクバーのボタン中心へ吸い込む
		const dx = (brect.left + brect.width / 2) - (this.rect.left + this.rect.width / 2);
		const dy = (brect.top + brect.height / 2) - (this.rect.top + this.rect.height / 2);

		// CSS 変数セット（minimizeアニメ用）
		this.frNode.style.setProperty("--min-dx", dx + "px");
		this.frNode.style.setProperty("--min-dy", dy + "px");

		// アニメ開始
		this.frNode.classList.add("minimizeAnim");

		this.frNode.addEventListener("animationend", () => {

			this.frNode.classList.add("minimize");
			this.frNode.classList.remove("minimizeAnim");
			this.frNode.classList.remove("maximize");
			this.frNode.style.removeProperty("--min-dx");
			this.frNode.style.removeProperty("--min-dy");

			// 非表示（最小化状態）
			this.frNode.style.display = "none";

			if (this.onUnMinimize) { this.onUnMinimize(this); }
		}, { once: true });

	};


	/*--------------------------------------------------
		Miximize to Normal
	--------------------------------------------------*/
	maximize2normal = () => {

		if (!this.twNode || !this.rect) return;

		// 最大化中でも前面に
		this.bringToFront();

		this.frNode.style.display = "block";
		this.lastStat = "maximize";

		// maximize状態の見た目を一旦 px で固定（現在値を確定）
		const r = this.frNode.getBoundingClientRect();
		this.frNode.style.top = r.top + "px";
		this.frNode.style.left = r.left + "px";
		this.frNode.style.width = r.width + "px";
		this.frNode.style.height = r.height + "px";

		// 次フレームで normal に戻す（差分が必ず出る）
		requestAnimationFrame(() => {
			this.bringbackStyle();
		});

		// ★漏れてたやつ：ここで復元（top/left/width/height が変わる）
		this.bringbackStyle();

		const onEnd = (e) => {
			if (e.target !== this.frNode) return;
			if (!["width", "height", "top", "left"].includes(e.propertyName)) return;

			// ここから後始末
			this.frNode.style.transform = "";
			this.frNode.style.opacity = "";
			this.frNode.classList.remove("maximize");
			this.frNode.style.removeProperty("--min-dx");
			this.frNode.style.removeProperty("--min-dy");

			this.adjust_wdNode_height();

			if (this.onUnMinimize) { this.onUnMinimize(this); }

			this.frNode.removeEventListener("transitionend", onEnd);
		};
		this.frNode.addEventListener("transitionend", onEnd);

	};



	/*--------------------------------------------------
		Minimize to Maximize
	--------------------------------------------------*/
	minimize2maximize = () => {

		if (!this.twNode) return;

		// 最大化中でも前面に
		this.bringToFront();

		this.lastStat = "minimize";
		this.frNode.style.display = "block";

		// 念のため transform / opacity を初期化
		this.frNode.style.transform = "none";
		this.frNode.style.opacity = "0";

		// 2) 「最大化状態」の矩形にしておく（最終的な位置・サイズ）
		const scr = this.scNode.getBoundingClientRect();
		const taskbarHeight = this.tbNode.offsetHeight ?? 0;

		this.frNode.style.top = "0px";
		this.frNode.style.left = "0px";
		this.frNode.style.width = scr.width + "px";
		this.frNode.style.height = (scr.height - taskbarHeight) + "px";

		// 状態フラグとして maximize を付けておく
		this.frNode.classList.add("maximize");

		// 3) ここから「タスクボタン位置から飛び出してくる」ように見せる
		const brect = this.twNode.getBoundingClientRect();

		const dx = (brect.left + brect.width / 2) - (this.rect.left + this.rect.width / 2);
		const dy = (brect.top + brect.height / 2) - (this.rect.top + this.rect.height / 2);

		this.frNode.style.setProperty("--restore-dx", dx + "px");
		this.frNode.style.setProperty("--restore-dy", dy + "px");

		// 4) アニメ開始
		this.frNode.classList.add("restoreAnim");

		this.frNode.addEventListener("animationend", () => {

			// transform / opacity はキーフレームの最終値からクリアしておく
			this.frNode.style.transform = "";
			this.frNode.style.opacity = "";

			this.frNode.classList.remove("minimize");
			this.frNode.classList.remove("restoreAnim");
			this.frNode.style.removeProperty("--min-dx");
			this.frNode.style.removeProperty("--min-dy");

			if (this.onUnMinimize) { this.onUnMinimize(this); }
			if (this.onMaximize) { this.onMaximize(this); }

		}, { once: true });

	};



	/*--------------------------------------------------
		ウィンドウを閉じる
	--------------------------------------------------*/
	closeWindow = () => {
		return new Promise((resolve) => {

			this.frNode.classList.add("closing");

			requestAnimationFrame(() => {
				this.frNode.style.transform = "scale(0.7)";
				this.frNode.style.opacity = "0";
			});

			const onEnd = () => {
				this.frNode.removeEventListener("transitionend", onEnd);

				this.frNode.remove();
				this.twNode?.remove();

				if (this.onClose) { this.onClose(this); }

				resolve();
			};

			// transition がある前提
			this.frNode.addEventListener("transitionend", onEnd);

			// ★保険（transitionend 来ない環境用）
			setTimeout(onEnd, 250);
		});
	};





	/*--------------------------------------------------
		ウィンドウリサイズアニメーション
	--------------------------------------------------*/
	windowResizeAnimation = async (point, size, outMin = false) => {

		return new Promise((resolve) => {

			// アニメーション
			let cnt = 1;
			let timer = setInterval(() => {
				this.frNode.style.top = point.start.top + (point.unit.top * cnt) + "px";
				this.frNode.style.left = point.start.left + (point.unit.left * cnt) + "px";
				this.frNode.style.height = size.start.height + (size.unit.height * cnt) + "px";
				this.frNode.style.width = size.start.width + (size.unit.width * cnt) + "px";
				if (outMin) {
					this.tbNode.parentNode.insertBefore(this.frNode, this.tbNode);
					outMin = false;
				}
				cnt++;
				if (cnt == 11) {
					clearInterval(timer);
					resolve();
				}
			}, this.animationSpeed / 10);

		});

	};



	/*--------------------------------------------------
		ウィンドウの移動
	--------------------------------------------------*/
	moveWindow = () => {

		let dragging = false;
		let armed = false;           // ★ クリック開始直後（まだドラッグ確定してない）
		let startLeft = 0, startTop = 0;
		let mousePos = { left: 0, top: 0 };
		let nextX = 0, nextY = 0;
		let pending = false;
		let activePointerId = null;

		const isBlocked = () =>
			this.frNode.classList.contains("maximize") ||
			this.frNode.classList.contains("minimize");

		const requestDraw = () => {
			if (pending) return;
			pending = true;

			requestAnimationFrame(() => {
				this.frNode.style.left = nextX + "px";
				this.frNode.style.top = nextY + "px";
				pending = false;
			});
		};

		// ===== ダブルクリックで maximize トグル =====
		this.hdNode.addEventListener("dblclick", (e) => {
			// ボタン領域は除外（あなたの stopPropagation 対策と併用）
			if (e.target.closest(".sweWindowHeaderButtons")) return;

			e.preventDefault();
			e.stopPropagation();

			// クリック途中の状態をキャンセル
			armed = false;
			if (dragging && activePointerId !== null) {
				try { this.hdNode.releasePointerCapture(activePointerId); } catch { }
			}
			dragging = false;
			this.frNode.classList.remove("dragging");

			// maximize ボタンと同じ挙動
			this.toggleMaximize?.(); // ← 既存があるならそれを
			// ないなら: this.normal2maximize / maximize2normal の分岐でもOK
		}, { passive: false });

		// ===== 移動開始（ただし即ドラッグ開始しない） =====
		this.hdNode.addEventListener("pointerdown", (e) => {
			if (e.button !== 0 || isBlocked()) return;
			if (e.target.closest(".sweWindowHeaderButtons")) return;

			armed = true;
			dragging = false;
			activePointerId = e.pointerId;

			this.hdNode.setPointerCapture(e.pointerId);

			mousePos = { left: e.clientX, top: e.clientY };
			startLeft = parseInt(this.frNode.style.left) || 0;
			startTop = parseInt(this.frNode.style.top) || 0;

			nextX = startLeft;
			nextY = startTop;
		});

		// ===== 移動中 =====
		this.hdNode.addEventListener("pointermove", (e) => {
			if (!armed && !dragging) return;

			const dx = e.clientX - mousePos.left;
			const dy = e.clientY - mousePos.top;

			// ★ まだドラッグ確定してないなら「少し動いたら開始」
			if (armed && !dragging) {
				if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return; // クリック扱いの範囲
				dragging = true;
				armed = false;
				this.frNode.classList.add("dragging");
				// ドラッグ開始時に前面へ（必要なら）
				this.bringToFront?.();
			}

			if (!dragging) return;

			nextX = startLeft + dx;
			nextY = startTop + dy;

			requestDraw();
		});

		// ===== 終了 =====
		this.hdNode.addEventListener("pointerup", (e) => {
			if (activePointerId === e.pointerId) {
				try { this.hdNode.releasePointerCapture(e.pointerId); } catch { }
				activePointerId = null;
			}

			// クリックだけで終わった場合
			if (armed) {
				armed = false;
				return;
			}

			if (!dragging) return;

			dragging = false;
			this.frNode.classList.remove("dragging");
			this.setCurrentrect?.();
		});

		// pointercancel も入れておくと堅い
		this.hdNode.addEventListener("pointercancel", (e) => {
			armed = false;
			if (activePointerId === e.pointerId) {
				try { this.hdNode.releasePointerCapture(e.pointerId); } catch { }
				activePointerId = null;
			}
			dragging = false;
			this.frNode.classList.remove("dragging");
		});
	};



	/*--------------------------------------------------
		リサイズパーツの追加
	--------------------------------------------------*/
	addResizeParts = () => {

		let attachReizer = (p) => {

			const resizer = document.createElement("div");
			resizer.classList.add("sweWindow_resize_" + p);
			this.frNode.append(resizer);

			let dragging = false;
			let startMouse = { x: 0, y: 0 };
			let startSize = { w: 0, h: 0 };
			let startPos = { x: 0, y: 0 };

			// rAF 用
			let pending = false;
			let nextW = null, nextH = null;
			let nextLeft = null, nextTop = null;

			// rAF 更新メソッド
			const applyResize = () => {
				if (pending) return;
				pending = true;

				requestAnimationFrame(() => {

					// 横方向
					if (nextW !== null) this.frNode.style.width = nextW + "px";
					if (nextLeft !== null) this.frNode.style.left = nextLeft + "px";

					// 縦方向
					if (nextH !== null) this.frNode.style.height = nextH + "px";
					if (nextTop !== null) this.frNode.style.top = nextTop + "px";
					//console.log("width x height", this.frNode.style.width, this.frNode.style.height);
					// コンテンツの高さ調整
					this.adjust_wdNode_height();

					pending = false;
				});
			};

			// 掴む
			resizer.addEventListener("pointerdown", (e) => {

				dragging = true;

				// 軽量モード ON
				this.frNode.classList.add("resizing");
				this.scNode.classList.add("unselectable");

				this.frNode.setPointerCapture(e.pointerId);

				startMouse.x = e.clientX;
				startMouse.y = e.clientY;

				startPos.x = parseFloat(this.frNode.style.left) || 0;
				startPos.y = parseFloat(this.frNode.style.top) || 0;
				startSize.w = parseFloat(this.frNode.style.width);
				startSize.h = parseFloat(this.frNode.style.height);

				let direction = e.target.getAttribute("class")
					.replace(/^.*sweWindow_resize_| .*$/gms, "");
				const dir = direction.toLowerCase();

				const onPointerMove = (e) => {
					if (!dragging) return;

					if (!this.moveFlag && this.onMoveStart) {
						this.onMoveStart(this);
						this.moveFlag = true;
					}

					const dx = e.clientX - startMouse.x;
					const dy = e.clientY - startMouse.y;

					nextW = nextH = nextLeft = nextTop = null;

					// ↑ 上側
					if (dir.includes("top")) {
						nextH = startSize.h - dy;
						nextTop = startPos.y + dy;
					}
					// ↓ 下側
					if (dir.includes("bottom")) {
						nextH = startSize.h + dy;
					}
					// ← 左側
					if (dir.includes("left")) {
						nextW = startSize.w - dx;
						nextLeft = startPos.x + dx;
					}
					// → 右側
					if (dir.includes("right")) {
						nextW = startSize.w + dx;
					}

					if (this.minSize) {
						if (nextW && this.minSize.width) {
							nextW = nextW < this.minSize.width ? this.minSize.width : nextW;
						}
						if (nextH && this.minSize.height) {
							nextH = nextH < this.minSize.height ? this.minSize.height : nextH;
						}
					}

					applyResize();
				};

				const onPointerUp = (e) => {
					dragging = false;
					this.frNode.releasePointerCapture(e.pointerId);

					// 軽量モード OFF
					this.frNode.classList.remove("resizing");
					this.scNode.classList.remove("unselectable");

					document.removeEventListener("pointermove", onPointerMove);
					document.removeEventListener("pointerup", onPointerUp);

					// コンテンツの高さ調整
					this.adjust_wdNode_height();

					if (this.moveFlag && this.onMoveEnd) {
						this.onMoveEnd(this);
						this.moveFlag = false;
					}
				};

				document.addEventListener("pointermove", onPointerMove);
				document.addEventListener("pointerup", onPointerUp);
			});
		};

		// 既存のあなたの生成ロジックそのまま
		let pp;
		for (const p of ["top", "right", "bottom", "left"]) {
			pp = pp ?? "left";
			attachReizer(pp + (p.charAt(0).toUpperCase() + p.slice(1)));
			attachReizer(p);
			pp = p;
		}
	};







}



/*
Copyright (c) 2025 scripcrypt
Licensed under the MIT License.
You may obtain a copy of the License at:
https://opensource.org/licenses/MIT
*/
