




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
		this._bindWheelPanGuard();
		this._bindHorizontalScrollClamp();

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

	_bindWheelPanGuard = () => {
		if (this.__sweWheelPanGuardBound) return;
		this.__sweWheelPanGuardBound = true;
		window.addEventListener(
			"wheel",
			(e) => {
				if (!e || !this.scNode) return;
				if (!this.scNode.contains(e.target)) return;
				const dx = Number(e.deltaX) || 0;
				const dy = Number(e.deltaY) || 0;
				// Suppress horizontal pan gestures; keep vertical scrolling intact.
				if (Math.abs(dx) < 0.5) return;
				if (Math.abs(dx) <= Math.abs(dy) * 0.2) return;
				if (e.cancelable) e.preventDefault();
				e.stopPropagation();
			},
			{ passive: false, capture: true }
		);
	};

	_bindHorizontalScrollClamp = () => {
		if (this.__sweHorizontalScrollClampBound) return;
		this.__sweHorizontalScrollClampBound = true;
		let scheduled = false;
		const clamp = () => {
			scheduled = false;
			const de = document.documentElement;
			const b = document.body;
			if (de && de.scrollLeft) de.scrollLeft = 0;
			if (b && b.scrollLeft) b.scrollLeft = 0;
			if (window.scrollX) window.scrollTo(0, window.scrollY);
		};
		document.addEventListener(
			"scroll",
			(e) => {
				if (!this.scNode) return;
				const t = e?.target;
				if (t && t.nodeType === 1 && !this.scNode.contains(t)) return;
				const de = document.documentElement;
				const b = document.body;
				if (!de && !b) return;
				const hasX = (de && de.scrollLeft) || (b && b.scrollLeft);
				if (!hasX) return;
				if (scheduled) return;
				scheduled = true;
				requestAnimationFrame(clamp);
			},
			true
		);
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


	/*--------------------------------------------------
			高速版 mergeConfig (structuredClone 代替)
	--------------------------------------------------*/
	mergeConfig = (target, source) => {
		// どちらかがオブジェクトでない場合は source を優先
		if (source === null || typeof source !== 'object' || Array.isArray(source)) {
			return source;
		}
		if (target === null || typeof target !== 'object' || Array.isArray(target)) {
			// target がプリミティブなら、source を浅くコピーして返す
			return Array.isArray(source) ? [...source] : { ...source };
		}

		// 新しいオブジェクトを作成（structuredClone を使わず、1階層ずつコピー）
		const output = { ...target };

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = output[key];

			// 両方がオブジェクト（プレーンな連想配列）なら再帰的にマージ
			if (
				sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
				targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
			) {
				output[key] = this.mergeConfig(targetValue, sourceValue);
			} else {
				// 片方がプリミティブ、または配列なら上書き（参照を切るためコピー）
				if (Array.isArray(sourceValue)) {
					output[key] = [...sourceValue];
				} else if (sourceValue && typeof sourceValue === 'object') {
					output[key] = { ...sourceValue };
				} else {
					output[key] = sourceValue;
				}
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
	parentWin = null;
	innerRoot = null;
	floatLayer = null;
	_dockNode = null;
	_dockAutoHideDefault = false;
	_dockAutoHideTrigger = "hover";
	_dockOverlayZBase = 1000;
	_dockOverlayBandZMax = 99999;
	_dockInsetVarTop = "--sweDockInsetTop";
	_dockInsetVarRight = "--sweDockInsetRight";
	_dockInsetVarBottom = "--sweDockInsetBottom";
	_dockInsetVarLeft = "--sweDockInsetLeft";

	/*--------------------------------------------------
		Internal Desktop / Docking
	--------------------------------------------------*/
	_dockIsRowSide = (side) => {
		return side === "left" || side === "right";
	};

	_dockSplitAxisClass = (side) => {
		return this._dockIsRowSide(side) ? "row" : "column";
	};

	_dockAppendBandChildren = (band, tab, divider, bandContent, side) => {
		// 目的の並び: tab → divider → content（right/bottom） / content → divider → tab（left/top）
		// ※タブは常にメイン側（ウィンドウ視点で内側）に寄せる
		if (side === "right" || side === "bottom") {
			band.append(tab);
			band.append(divider);
			band.append(bandContent);
		} else {
			band.append(bandContent);
			band.append(divider);
			band.append(tab);
		}
	};

	_dockAppendSplitChildren = (split, main, band, side) => {
		const order = (side === "left" || side === "top")
			? [band, main]
			: [main, band];
		split.append(...order);
	};

	_dockMountSplit = (currentDockNode, split) => {
		// overlay mode: no-op (bands are absolute overlays)
	};

	_dockCreateSplitNodes = (side) => {
		const band = document.createElement("div");
		band.classList.add("sweDockBand");
		band.dataset.side = side;
		band.dataset.autoHide = "false";
		band.style.zIndex = "";

		const tab = document.createElement("div");
		tab.classList.add("sweDockTab");

		const divider = document.createElement("div");
		divider.classList.add("sweDockDivider");
		divider.setAttribute("role", "separator");
		divider.dataset.side = side;

		const bandContent = document.createElement("div");
		bandContent.classList.add("sweDockBandContent");
		this._dockBindBandContentWheelIsolation(band, bandContent);

		this._dockAppendBandChildren(band, tab, divider, bandContent, side);

		return { band, tab, divider, bandContent };
	};

	_dockBindBandContentWheelIsolation = (band, bandContent) => {
		if (!bandContent || bandContent.__sweWheelIsolationBound) return;
		bandContent.__sweWheelIsolationBound = true;
		bandContent.addEventListener(
			"wheel",
			(e) => {
				const side = band?.dataset?.side;
				if (side !== "left" && side !== "right") return;
				if (!e) return;
				// Prevent wheel events (especially trackpad horizontal deltas) from panning the whole screen.
				e.stopPropagation();
				// Only intercept when the bandContent can actually scroll vertically.
				const canScrollY = bandContent.scrollHeight > bandContent.clientHeight + 1;
				if (!canScrollY) return;
				// Manually scroll vertically and suppress any horizontal motion.
				if (e.cancelable) e.preventDefault();
				bandContent.scrollLeft = 0;
				bandContent.scrollTop += e.deltaY;
			},
			{ passive: false }
		);
	};

	_dockGetBandFromNode = (node) => {
		return node?.closest?.(".sweDockBand") ?? null;
	};

	_setChildInDockBandClass = (childWin) => {
		if (!childWin?.frNode) return;
		const parent = childWin.parentWin;
		const inDockBand = !!(
			parent?.frNode &&
			(parent.frNode.classList.contains("docked") || parent.frNode.classList.contains("sweChildInDockBand"))
		);
		childWin.frNode.classList.toggle("sweChildInDockBand", inDockBand);
		if (inDockBand) {
			childWin.frNode.style.left = "";
			childWin.frNode.style.top = "";
			childWin.frNode.style.width = "100%";
			childWin.frNode.style.height = "";
			if (childWin.wdNode) {
				childWin.wdNode.style.top = "0px";
				childWin.wdNode.style.height = "";
			}
		} else {
			if (childWin.wdNode && childWin.hdNode) {
				childWin.wdNode.style.top = childWin.hdNode.offsetHeight + "px";
			}
		}
	};

	_setChildParentAndDockBandClass = (childWin, parentWin) => {
		if (!childWin) return;
		childWin.parentWin = parentWin;
		this._setChildInDockBandClass(childWin);
	};

	_dockRefreshTabIfNeeded = (band) => {
		if (!band) return;
		this._dockRefreshTabPresentation(band);
	};

	_dockCleanupEmptyOriginBand = (originParent, originBandContent) => {
		originParent?._cleanupEmptyDockFrom?.(originBandContent);
	};

	_dockGetBandContent = (band) => {
		return band?.querySelector?.(":scope > .sweDockBandContent") ?? null;
	};

	_dockGetTab = (band) => {
		return band?.querySelector?.(":scope > .sweDockTab") ?? null;
	};

	_dockGetDockedFrames = (bandContent) => {
		if (!bandContent) return [];
		return Array.from(bandContent.querySelectorAll(":scope > .sweWindowFrame"));
	};

	_dockAnimateScrollTo = (el, { top = null, left = null, durationMs = 180 } = {}) => {
		if (!el) return;
		const startTop = el.scrollTop;
		const startLeft = el.scrollLeft;
		const targetTop = top == null ? startTop : top;
		const targetLeft = left == null ? startLeft : left;
		const dx = targetLeft - startLeft;
		const dy = targetTop - startTop;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

		if (el.__sweDockScrollAnim?.rafId) {
			cancelAnimationFrame(el.__sweDockScrollAnim.rafId);
		}
		const anim = {
			start: performance.now(),
			rafId: 0,
		};
		el.__sweDockScrollAnim = anim;

		const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
		const step = (now) => {
			if (el.__sweDockScrollAnim !== anim) return;
			const t = Math.min(1, Math.max(0, (now - anim.start) / Math.max(1, durationMs)));
			const k = easeOutCubic(t);
			if (left != null) el.scrollLeft = startLeft + dx * k;
			if (top != null) el.scrollTop = startTop + dy * k;
			if (t < 1) {
				anim.rafId = requestAnimationFrame(step);
			}
		};
		anim.rafId = requestAnimationFrame(step);
	};

	_dockScrollFrameIntoBandView = (bandContent, frame, side, behavior = "smooth") => {
		if (!bandContent || !frame) return;
		const isHorizontalBand = side === "top" || side === "bottom";
		if (isHorizontalBand) {
			let left = 0;
			if (frame.parentElement === bandContent) {
				left = frame.offsetLeft;
			} else {
				const br = bandContent.getBoundingClientRect();
				const fr = frame.getBoundingClientRect();
				left = fr.left - br.left + bandContent.scrollLeft;
			}
			left = Math.max(0, Math.min(left, Math.max(0, bandContent.scrollWidth - bandContent.clientWidth)));
			if (behavior === "smooth") this._dockAnimateScrollTo(bandContent, { left });
			else bandContent.scrollLeft = left;
		} else {
			let top = 0;
			if (frame.parentElement === bandContent) {
				top = frame.offsetTop;
			} else {
				const br = bandContent.getBoundingClientRect();
				const fr = frame.getBoundingClientRect();
				top = fr.top - br.top + bandContent.scrollTop;
			}
			top = Math.max(0, Math.min(top, Math.max(0, bandContent.scrollHeight - bandContent.clientHeight)));
			if (behavior === "smooth") this._dockAnimateScrollTo(bandContent, { top });
			else bandContent.scrollTop = top;
			// Side bands should never introduce horizontal scrolling.
			bandContent.scrollLeft = 0;
		}
	};

	_clearFrameInteractionState = (childWin, { clearTeleporting = true } = {}) => {
		if (!childWin?.frNode) return;
		childWin.frNode.style.transform = "";
		childWin.frNode.style.opacity = "";
		childWin.frNode.classList.remove("dragging");
		if (clearTeleporting) {
			childWin.frNode.classList.remove("teleporting");
		}
	};

	_reparentFrameToHost = (childWin, host, insertBefore = null) => {
		if (!childWin?.frNode || !host) return;
		// Reparenting should not carry over drag-transform based presentation.
		this._clearFrameInteractionState(childWin, { clearTeleporting: false });
		childWin.frNode.classList.add("teleporting");
		childWin.frNode.remove();
		if (insertBefore && insertBefore.parentElement === host) {
			host.insertBefore(childWin.frNode, insertBefore);
		} else {
			host.append(childWin.frNode);
		}
		requestAnimationFrame(() => {
			childWin.frNode.classList.remove("teleporting");
		});
	};

	_dockResetFrameForDock = (childWin) => {
		if (!childWin?.frNode) return;
		this._clearFrameInteractionState(childWin, { clearTeleporting: true });
	};

	_dockApplyDockedInlineLayout = (childWin) => {
		if (!childWin?.frNode) return;
		childWin.frNode.style.position = "relative";
		childWin.frNode.style.left = "";
		childWin.frNode.style.top = "";
		childWin.frNode.style.right = "";
		childWin.frNode.style.bottom = "";
		childWin.frNode.style.inset = "auto";
		childWin.frNode.style.flex = "0 0 auto";
	};

	_dockClearDockedInlineLayout = (childWin) => {
		if (!childWin?.frNode) return;
		this._clearFrameInteractionState(childWin, { clearTeleporting: false });
		childWin.frNode.style.width = "";
		childWin.frNode.style.height = "";
		childWin.frNode.style.minHeight = "";
		childWin.frNode.style.flex = "";
		childWin.frNode.style.position = "";
		childWin.frNode.style.left = "";
		childWin.frNode.style.top = "";
		childWin.frNode.style.right = "";
		childWin.frNode.style.bottom = "";
		childWin.frNode.style.inset = "";
		childWin.frNode.style.transform = "";
		childWin.frNode.style.opacity = "";
	};

	_dockGetActiveDockedFrame = (bandContent) => {
		if (!bandContent) return null;
		return bandContent.querySelector(":scope > .sweWindowFrame.sweDockActive")
			?? bandContent.querySelector(":scope > .sweWindowFrame")
			?? null;
	};

	_dockSetActiveDockedFrame = (bandContent, frame) => {
		if (!bandContent) return;
		const frames = this._dockGetDockedFrames(bandContent);
		for (const fr of frames) {
			const isActive = fr === frame;
			fr.classList.toggle("sweDockActive", isActive);
		}
	};

	_dockEnsureTabItem = (band, childWin) => {
		if (!band || !childWin) return null;
		const tab = this._dockGetTab(band);
		if (!tab) return null;
		const id = childWin.winid || childWin.title || "dock";
		let item = tab.querySelector(`:scope > .sweDockTabItem[data-winid="${CSS.escape(String(id))}"]`);
		if (item) return item;
		item = document.createElement("div");
		item.classList.add("sweDockTabItem");
		item.dataset.winid = String(id);
		item.textContent = childWin.title || childWin.winid || "dock";
		item.addEventListener("pointerdown", (e) => {
			// Ctrl/Shift are reserved for tab-level behaviors.
			// Shift on a tab item should undock THAT window (not the active one).
			if (e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				if (childWin?.parentWin === this) {
					this.undockToFloat(childWin);
				}
				return;
			}
			if (e.ctrlKey) return;
			e.preventDefault();
			e.stopPropagation();
			// Tab items scroll the corresponding docked window into view.
			const bandContent = this._dockGetBandContent(band);
			if (!bandContent) return;
			if (band.classList.contains("autoHide") && !band.classList.contains("expanded")) {
				this._dockAutoHideCancelClose(band);
				this._dockSetBandExpanded(band, true);
			}
			const side = band?.dataset?.side;
			const tryScroll = (tries = 0) => {
				if (tries > 8) return;
				// Wait until layout is ready (autoHide expand can be display:none -> flex).
				const ready = bandContent.clientHeight > 0 && bandContent.scrollHeight > 0;
				if (!ready) {
					requestAnimationFrame(() => tryScroll(tries + 1));
					return;
				}
				const frames = this._dockGetDockedFrames(bandContent);
				const fr = frames.find((x) => x?.sweWindow === childWin) || childWin.frNode;
				this._dockScrollFrameIntoBandView(bandContent, fr, side, "smooth");
			};
			requestAnimationFrame(() => tryScroll(0));
		});
		tab.append(item);
		return item;
	};

	_dockRefreshTabPresentation = (band) => {
		if (!band) return;
		const tab = this._dockGetTab(band);
		const bandContent = this._dockGetBandContent(band);
		if (!tab || !bandContent) return;

		const frames = this._dockGetDockedFrames(bandContent);
		if (frames.length <= 1) {
			// Single-label mode.
			tab.classList.remove("stacked");
			for (const it of Array.from(tab.querySelectorAll(":scope > .sweDockTabItem"))) it.remove();
			const fr = frames[0] || null;
			const child = fr?.sweWindow;
			tab.textContent = child?.title || child?.winid || "dock";
			return;
		}

		// Multi-item mode: show one tab item per docked frame.
		tab.classList.add("stacked");
		tab.textContent = "";
		const keep = new Set();
		for (const fr of frames) {
			const child = fr?.sweWindow;
			if (!child) continue;
			const id = String(child.winid || child.title || "dock");
			keep.add(id);
			this._dockEnsureTabItem(band, child);
		}
		for (const it of Array.from(tab.querySelectorAll(":scope > .sweDockTabItem"))) {
			const id = String(it.dataset.winid || "");
			if (!keep.has(id)) it.remove();
		}
	};

	_dockUpdateTabActiveState = (band) => {
		if (!band) return;
		const tab = this._dockGetTab(band);
		const bandContent = this._dockGetBandContent(band);
		if (!tab || !bandContent) return;
		const active = this._dockGetActiveDockedFrame(bandContent);
		const items = Array.from(tab.querySelectorAll(":scope > .sweDockTabItem"));
		for (const it of items) {
			const winid = it.dataset.winid;
			const isActive = !!(active?.sweWindow && (String(active.sweWindow.winid || active.sweWindow.title || "") === String(winid)));
			it.classList.toggle("active", isActive);
		}
	};

	_dockRemoveTabItem = (band, childWin) => {
		if (!band || !childWin) return;
		const tab = this._dockGetTab(band);
		if (!tab) return;
		const id = childWin.winid || childWin.title || "dock";
		const item = tab.querySelector(`:scope > .sweDockTabItem[data-winid="${CSS.escape(String(id))}"]`);
		item?.remove?.();
		this._dockRefreshTabPresentation(band);
	};

	_dockGetSplitFromBand = (band) => {
		return band?.closest?.(".sweDockSplit") ?? null;
	};

	_dockGetMainFromSplit = (split) => {
		return split?.querySelector?.(":scope > .sweDockMain") ?? null;
	};

	_dockCollapseSplitIfNeeded = (split) => {
		if (!split) return;
		const main = this._dockGetMainFromSplit(split);
		if (!main) return;
		const survivor = main.firstElementChild;
		if (survivor) {
			split.replaceWith(survivor);
		} else {
			this.innerRoot?.append(this.floatLayer);
			split.remove();
		}
		this._recomputeDockNode();
	};

	_dockResolveAutoHide = (band) => {
		const mode = band?.dataset?.autoHide ?? "inherit";
		return mode === "inherit" ? this._dockAutoHideDefault : mode === "true";
	};

	_dockBindUndockFromTab = (band) => {
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweUndockBound) return;
		tab.__sweUndockBound = true;
		tab.addEventListener("pointerdown", (e) => {
			if (!e.shiftKey) return;
			e.preventDefault();
			e.stopPropagation();
			const bandContent = this._dockGetBandContent(band);
			const fr = this._dockGetActiveDockedFrame(bandContent);
			const child = fr?.sweWindow;
			if (!child) return;
			this.undockToFloat(child);
		});
	};

	_dockBindScrollToStartFromTab = (band) => {
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweScrollToStartBound) return;
		tab.__sweScrollToStartBound = true;
		tab.addEventListener("pointerdown", (e) => {
			// Keep modifier behaviors (Ctrl toggle / Shift undock) intact.
			if (e.ctrlKey || e.shiftKey) return;
			e.preventDefault();
			e.stopPropagation();
			const bandContent = this._dockGetBandContent(band);
			if (!bandContent) return;
			const side = band?.dataset?.side;
			if (band.classList.contains("autoHide") && !band.classList.contains("expanded")) {
				this._dockAutoHideCancelClose(band);
				this._dockSetBandExpanded(band, true);
			}
			requestAnimationFrame(() => {
				if (side === "top" || side === "bottom") {
					bandContent.scrollTo({ left: 0, behavior: "smooth" });
				} else {
					bandContent.scrollTo({ top: 0, behavior: "smooth" });
				}
			});
		});
	};

	_dockBindToggleAutoHideFromTab = (band) => {
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweAutoHideToggleBound) return;
		tab.__sweAutoHideToggleBound = true;
		tab.addEventListener("pointerdown", (e) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			e.stopPropagation();
			const cur = band?.dataset?.autoHide ?? "inherit";
			band.dataset.autoHide = (cur === "true") ? "false" : "true";
			this._applyDockAutoHide(band);
		});
	};

	_dockBindAutoHideClick = (band) => {
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweClickBound) return;
		tab.__sweClickBound = true;
		tab.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._dockSetBandExpanded(band, !band.classList.contains("expanded"));
		});
	};

	_dockSetBandExpanded = (band, expanded) => {
		if (!band) return;
		const isAutoHide = band.classList.contains("autoHide");
		if (!isAutoHide) {
			band.classList.toggle("expanded", !!expanded);
			this._dockUpdateOverlayInsets();
			return;
		}

		if (band.__sweAutoHideInsetTimer != null) {
			clearTimeout(band.__sweAutoHideInsetTimer);
			band.__sweAutoHideInsetTimer = null;
		}

		if (expanded) {
			const saved = band.__sweAutoHideExpandedStyle;
			if (saved) {
				if (saved.flex != null) band.style.flex = saved.flex;
				if (saved.flexBasis != null) band.style.flexBasis = saved.flexBasis;
				if (saved.width != null) band.style.width = saved.width;
				if (saved.height != null) band.style.height = saved.height;
			}
			band.classList.add("sweDockAnimating");
			band.classList.add("expanded");
			this._dockUpdateOverlayInsets();
			requestAnimationFrame(() => this._dockUpdateOverlayInsets());
			band.__sweAutoHideInsetTimer = setTimeout(() => {
				band.__sweAutoHideInsetTimer = null;
				band.classList.remove("sweDockAnimating");
				this._dockUpdateOverlayInsets();
			}, 320);
		} else {
			// Save last expanded inline sizing and clear it so collapsed CSS (tab-size) can take effect.
			band.__sweAutoHideExpandedStyle = {
				flex: band.style.flex,
				flexBasis: band.style.flexBasis,
				width: band.style.width,
				height: band.style.height,
			};
			const side = band?.dataset?.side;
			const isRow = side === "left" || side === "right";
			const curSize = isRow ? (band.offsetWidth || 0) : (band.offsetHeight || 0);
			const tabSizeRaw = getComputedStyle(band).getPropertyValue("--dock-tab-size");
			const tabSize = Number.parseFloat(tabSizeRaw) || 20;
			const cleanupAnim = () => {
				band.removeEventListener("transitionend", onEnd);
				band.classList.remove("sweDockCollapsing");
				band.classList.remove("sweDockAnimating");
				// Switch to collapsed state ONLY after the collapse animation finishes.
				band.classList.remove("expanded");
				band.classList.remove("sweDockArrowDelay");
				band.classList.remove("sweDockFrontBand");
				band.style.zIndex = "";
				if (band.__sweDockArrowDelayTimer != null) {
					clearTimeout(band.__sweDockArrowDelayTimer);
					band.__sweDockArrowDelayTimer = null;
				}
				if (isRow) band.style.width = "";
				else band.style.height = "";
				this._dockUpdateOverlayInsets();
				// When collapsing an autoHide band, make sure the tab is visible.
				band.classList.add("sweDockShowTab");
				setTimeout(() => band.classList.remove("sweDockShowTab"), 280);
			};
			const onEnd = (e) => {
				if (!e) return;
				if (isRow && e.propertyName !== "width") return;
				if (!isRow && e.propertyName !== "height") return;
				cleanupAnim();
			};
			band.style.flex = "";
			band.style.flexBasis = "";
			band.classList.add("sweDockCollapsing");
			band.classList.add("sweDockAnimating");
			// Ensure collapse doesn't keep front-band styling/z-index.
			band.classList.remove("sweDockFrontBand");
			band.style.zIndex = "";
			// Keep 'expanded' during the animation to avoid showing collapsed arrow too early.
			// Fix current size as an explicit pixel value so width/height transition can run.
			if (isRow) band.style.width = curSize + "px";
			else band.style.height = curSize + "px";
			// Force reflow so the next size change transitions.
			void band.offsetWidth;
			band.addEventListener("transitionend", onEnd);
			// Trigger transition to collapsed tab size.
			requestAnimationFrame(() => {
				if (isRow) band.style.width = tabSize + "px";
				else band.style.height = tabSize + "px";
				// In case transition doesn't fire (browser edge case), ensure cleanup.
				setTimeout(cleanupAnim, 420);
			});
		}
	};

	_dockAutoHideCloseDelayMs = () => {
		return this.scInst?.config?.dock?.autoHideCloseDelayMs ?? 180;
	};

	_dockAutoHideCancelClose = (band) => {
		if (!band) return;
		if (band.__sweAutoHideCloseTimer != null) {
			clearTimeout(band.__sweAutoHideCloseTimer);
			band.__sweAutoHideCloseTimer = null;
		}
	};

	_dockAutoHideIsCloseBlocked = (band) => {
		if (!band) return false;
		if (band.__sweResizing) return true;
		const now = Date.now();
		if (band.__sweAutoHideLockUntil && now < band.__sweAutoHideLockUntil) return true;
		if (band.__sweForceExpandedUntil && now < band.__sweForceExpandedUntil) return true;
		return false;
	};

	_dockAutoHideScheduleClose = (band) => {
		if (!band) return;
		if (!band.classList.contains("autoHide")) return;
		if (this._dockAutoHideIsCloseBlocked(band)) return;
		this._dockAutoHideCancelClose(band);
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		band.__sweAutoHideCloseTimer = setTimeout(() => {
			band.__sweAutoHideCloseTimer = null;
			if (!band.classList.contains("autoHide")) return;
			if (this._dockAutoHideIsCloseBlocked(band)) return;
			this._dockSetBandExpanded(band, false);
		}, closeDelayMs);
	};

	_dockAutoHideScheduleCloseAfterUnblock = (band) => {
		if (!band) return;
		if (!band.classList.contains("autoHide")) return;
		this._dockAutoHideCancelClose(band);
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		const now = Date.now();
		const lockUntil = Number(band.__sweAutoHideLockUntil || 0);
		const forceUntil = Number(band.__sweForceExpandedUntil || 0);
		const unblockAt = Math.max(now, lockUntil, forceUntil);
		const waitMs = Math.max(0, unblockAt - now) + closeDelayMs;
		band.__sweAutoHideCloseTimer = setTimeout(() => {
			band.__sweAutoHideCloseTimer = null;
			if (!band.classList.contains("autoHide")) return;
			if (this._dockAutoHideIsCloseBlocked(band)) return;
			this._dockSetBandExpanded(band, false);
		}, waitMs);
	};

	_dockBindAutoHideHover = (band) => {
		if (band.__sweHoverBound) return;
		const tab = this._dockGetTab(band);
		if (!tab) return;
		band.__sweHoverBound = true;
		tab.addEventListener("pointerenter", () => {
			if (!band.classList.contains("autoHide")) return;
			this._dockAutoHideCancelClose(band);
			this._dockSetBandExpanded(band, true);
		});

		// Close only when leaving the whole band to avoid flicker while moving from tab to content.
		band.addEventListener("pointerenter", () => {
			this._dockAutoHideCancelClose(band);
		});
		band.addEventListener("pointerleave", () => {
			if (!band.classList.contains("autoHide")) return;
			this._dockAutoHideScheduleClose(band);
		});
	};

	ensureInnerDesktop = () => {
		if (!this.wdNode || this.innerRoot) return;

		this._dockAutoHideDefault = !!(this.scInst?.config?.dock?.autoHide ?? false);
		this._dockAutoHideTrigger = (this.scInst?.config?.dock?.trigger ?? "hover");

		this.wdNode.classList.add("sweHasInnerDesktop");

		// Move the existing window content into the inner desktop so it becomes part of the
		// dock layout (otherwise it stays behind the absolute-positioned innerRoot and looks
		// like it is "under" the dock bands).
		const existingContentNodes = Array.from(this.wdNode.childNodes);

		const innerRoot = document.createElement("div");
		innerRoot.classList.add("sweInnerRoot");

		const overlayRoot = document.createElement("div");
		overlayRoot.classList.add("sweDockOverlayRoot");

		const floatLayer = document.createElement("div");
		floatLayer.classList.add("sweFloatLayer");
		floatLayer.append(...existingContentNodes);

		overlayRoot.append(floatLayer);
		innerRoot.append(overlayRoot);
		this.wdNode.append(innerRoot);

		this.innerRoot = innerRoot;
		this.overlayRoot = overlayRoot;
		this.floatLayer = floatLayer;
		this._dockNode = overlayRoot;
	};

	_dockGetOverlayRoot = () => {
		return this.overlayRoot || this.innerRoot;
	};

	_dockBindOverlayBandZBump = (band, direction) => {
		if (!band || band.__sweOverlayZBound) return;
		band.__sweOverlayZBound = true;
		let leaveTimer = null;
		const isCollapsedAutoHide = () => band.classList.contains("autoHide") && !band.classList.contains("expanded");

		const bumpZ = () => {
			if (isCollapsedAutoHide()) return;
			const root = this._dockGetOverlayRoot?.();
			if (!root) return;
			// Keep the last interacted band above other bands using z-index (avoid DOM reorder).
			// floatLayer stays above all bands via CSS z-index.
			for (const b of root.querySelectorAll(":scope > .sweDockBand.sweDockFrontBand")) {
				if (b !== band) b.classList.remove("sweDockFrontBand");
			}
			band.classList.add("sweDockFrontBand");
			root.__sweOverlayZCounter = (root.__sweOverlayZCounter || this._dockOverlayZBase) + 1;
			const z = String(Math.min(root.__sweOverlayZCounter, this._dockOverlayBandZMax));
			band.style.zIndex = z;
			const tab = this._dockGetTab(band);
			if (tab) tab.style.zIndex = z;
		};

		const showTab = () => {
			if (isCollapsedAutoHide()) return;
			bumpZ();
			if (leaveTimer) {
				clearTimeout(leaveTimer);
				leaveTimer = null;
			}
			band.classList.add("sweDockShowTab");
		};

		if (direction === "top" || direction === "bottom") {
			band.addEventListener("pointerenter", showTab);
		} else {
			band.addEventListener("pointerenter", bumpZ);
			band.addEventListener("click", showTab);
		}

		band.addEventListener("pointerleave", () => {
			if (leaveTimer) clearTimeout(leaveTimer);
			leaveTimer = setTimeout(() => {
				leaveTimer = null;
				band.classList.remove("sweDockShowTab");
			}, 120);
		});
	};

	_dockUpdateOverlayInsets = () => {
		const overlay = this._dockGetOverlayRoot();
		if (!overlay) return;
		const getInset = (side) => {
			const band = overlay.querySelector?.(`:scope > .sweDockBand[data-side="${side}"]`) ?? null;
			if (!band) return 0;
			if (band.classList.contains("autoHide") && !band.classList.contains("expanded")) return 0;
			if (side === "left" || side === "right") return band.offsetWidth || 0;
			return band.offsetHeight || 0;
		};
		overlay.style.setProperty(this._dockInsetVarTop, getInset("top") + "px");
		overlay.style.setProperty(this._dockInsetVarRight, getInset("right") + "px");
		overlay.style.setProperty(this._dockInsetVarBottom, getInset("bottom") + "px");
		overlay.style.setProperty(this._dockInsetVarLeft, getInset("left") + "px");
	};

	_setFramePosInHostFromViewportRect = (host, viewportRect) => {
		const hr = host.getBoundingClientRect();
		const left = viewportRect.left - hr.left;
		const top = viewportRect.top - hr.top;
		this.frNode.style.left = left + "px";
		this.frNode.style.top = top + "px";
		this.setCurrentrect?.();
	};

	_teleportFrameToHostFromViewportRect = ({
		host,
		viewportRect,
		bottomInset = 0,
		originParent = null,
		originBandContent = null,
		cleanupOriginDock = false,
		afterTeleport = null,
		reorderZ = false,
	} = {}) => {
		if (!host || !this.frNode || !viewportRect) return;
		this.frNode.classList.add("teleporting");
		this.frNode.remove();
		host.append(this.frNode);
		if (typeof afterTeleport === "function") {
			afterTeleport();
		}
		this._setFramePosInHostFromViewportRect(host, viewportRect);
		this._clampFrameIntoHost(host, bottomInset);
		if (cleanupOriginDock) {
			originParent?._cleanupEmptyDockFrom?.(originBandContent);
		}
		if (reorderZ) {
			this.scInst?.reorderZ?.(this, false);
		}
		requestAnimationFrame(() => {
			this.frNode.classList.remove("teleporting");
		});
	};

	_clampFrameIntoHost = (host, bottomInset = 0) => {
		if (!host || !this.frNode) return;
		const w = this.frNode.offsetWidth || this.rect?.width || 0;
		const h = this.frNode.offsetHeight || this.rect?.height || 0;
		const maxLeft = Math.max(0, host.clientWidth - w);
		const maxTop = Math.max(0, host.clientHeight - bottomInset - h);

		let left = Number(this.frNode.style.left?.replace(/px$/, ""));
		let top = Number(this.frNode.style.top?.replace(/px$/, ""));
		if (!Number.isFinite(left)) left = this.frNode.offsetLeft;
		if (!Number.isFinite(top)) top = this.frNode.offsetTop;

		left = Math.min(Math.max(0, left), maxLeft);
		top = Math.min(Math.max(0, top), maxTop);

		this.frNode.style.left = left + "px";
		this.frNode.style.top = top + "px";
		this.setCurrentrect?.();
	};

	_isDocked = () => {
		return !!this.frNode?.closest?.(".sweDockBand");
	};

	_findParentWindowFromPoint = (x, y) => {
		const els = document.elementsFromPoint(x, y);
		let firstNonDocked = null;
		for (const el of els) {
			const fr = el?.closest?.(".sweWindowFrame");
			if (!fr) continue;
			if (fr === this.frNode) continue;
			const inst = fr.sweWindow;
			if (!inst || inst === this) continue;
			// Prefer docked windows as drop targets so subwindows can be nested into a docked window
			// even when the host window frame is also under the pointer.
			if (fr.classList.contains("docked")) return inst;
			if (!firstNonDocked) firstNonDocked = inst;
		}
		return firstNonDocked;
	};

	_findDockBandContentFromPoint = (x, y) => {
		const els = document.elementsFromPoint(x, y);
		for (const el of els) {
			const bandContent = el?.closest?.(".sweDockBandContent");
			if (!bandContent) continue;
			const band = bandContent.closest?.(".sweDockBand") ?? null;
			if (!band) continue;
			return { band, bandContent };
		}
		return null;
	};

	_findDockedFrameInBandFromPoint = (bandContent, x, y) => {
		if (!bandContent) return null;
		const els = document.elementsFromPoint(x, y);
		for (const el of els) {
			const fr = el?.closest?.(".sweWindowFrame.docked");
			if (!fr) continue;
			if (fr === this.frNode) continue;
			if (fr.parentElement !== bandContent) continue;
			return fr;
		}
		return null;
	};

	_dockRefreshStackSeparators = (bandContent) => {
		if (!bandContent) return;
		const frames = Array.from(bandContent.querySelectorAll(":scope > .sweWindowFrame.docked"));
		frames.forEach((fr, i) => {
			fr.classList.toggle("sweChildInDockBand", i > 0);
			fr.style.display = "";
			const inst = fr.sweWindow;
			if (inst?.wdNode) {
				inst.wdNode.style.top = "0px";
				inst.wdNode.style.height = "";
			}
		});
	};

	_detectDockDirection = (host, x, y) => {
		const r = host.getBoundingClientRect();
		const thresholdX = Math.max(24, Math.min(80, r.width * 0.12));
		const thresholdY = Math.max(24, Math.min(80, r.height * 0.12));

		const dl = x - r.left;
		const dr = r.right - x;
		const dt = y - r.top;
		const db = r.bottom - y;

		// 左右優先
		if (dl >= 0 && dl < thresholdX) return "left";
		if (dr >= 0 && dr < thresholdX) return "right";
		if (dt >= 0 && dt < thresholdY) return "top";
		if (db >= 0 && db < thresholdY) return "bottom";
		return null;
	};

	attachToParent = (parentWin) => {
		if (!parentWin || parentWin === this) return;
		parentWin.ensureInnerDesktop?.();
		if (!parentWin.floatLayer) return;

		const originParent = this.parentWin;
		const originBandContent = this.frNode?.closest?.(".sweDockBandContent");

		const vr = this.frNode.getBoundingClientRect();
		const parentInDockContext = !!(
			parentWin.frNode?.classList?.contains("docked") ||
			parentWin.frNode?.classList?.contains("sweChildInDockBand")
		);
		this._teleportFrameToHostFromViewportRect({
			host: parentWin.floatLayer,
			viewportRect: vr,
			bottomInset: 0,
			originParent,
			originBandContent,
			cleanupOriginDock: true,
			afterTeleport: () => {
				// Maintain previous insertion order behavior (dock-context stacks children at top).
				if (parentInDockContext) {
					const firstChildFrame = parentWin.floatLayer.querySelector(":scope > .sweWindowFrame");
					if (firstChildFrame) {
						parentWin.floatLayer.insertBefore(this.frNode, firstChildFrame);
					}
				}
				this._setChildParentAndDockBandClass(this, parentWin);
			},
		});

		// If the parent is in a dock context, children should be laid out in flow (stacked).
		// Avoid absolute positioning based on viewport rect, which can make the child cover the parent.
		if (parentInDockContext) {
			// Ensure the docked parent's float layer stacks children vertically.
			if (!parentWin.floatLayer.__sweDockChildStacking) {
				parentWin.floatLayer.__sweDockChildStacking = true;
				parentWin.floatLayer.classList.add("sweDockChildStacking");
				parentWin.floatLayer.style.display = "flex";
				parentWin.floatLayer.style.flexDirection = "column";
				parentWin.floatLayer.style.alignItems = "stretch";
				parentWin.floatLayer.style.justifyContent = "flex-start";
				parentWin.floatLayer.style.minHeight = "0";
			}

			for (const fr of parentWin.floatLayer.querySelectorAll(":scope > .sweWindowFrame")) {
				fr.style.position = "relative";
				fr.style.left = "";
				fr.style.top = "";
				fr.style.inset = "auto";
				fr.style.width = "100%";
				fr.style.height = "";
				fr.style.flex = "0 0 auto";
			}

			this.frNode.style.position = "relative";
			this.frNode.style.left = "";
			this.frNode.style.top = "";
			this.frNode.style.inset = "auto";
			this.frNode.style.width = "100%";
			this.frNode.style.height = "";
			this.frNode.style.flex = "0 0 auto";
			this.setCurrentrect?.();
		} else {
			// Teleport helper already handled pos/clamp in float layer.
		}
	};

	detachToScreen = () => {
		if (!this.scInst?.scNode) return;
		const originParent = this.parentWin;
		const originBandContent = this.frNode?.closest?.(".sweDockBandContent");
		const vr = this.frNode.getBoundingClientRect();
		this._teleportFrameToHostFromViewportRect({
			host: this.scInst.scNode,
			viewportRect: vr,
			bottomInset: this.tbNode?.offsetHeight ?? 0,
			originParent,
			originBandContent,
			cleanupOriginDock: true,
			reorderZ: true,
			afterTeleport: () => {
				this._setChildParentAndDockBandClass(this, null);
			},
		});
	};

	_ensureDockSplit = (direction) => {
		this.ensureInnerDesktop();
		const overlay = this._dockGetOverlayRoot();
		if (!overlay) return {};

		// Overlay mode: one band per side, absolutely positioned over the main content.
		let band = overlay.querySelector?.(`:scope > .sweDockBand[data-side="${direction}"]`) ?? null;
		let bandContent = band ? this._dockGetBandContent(band) : null;
		if (band && bandContent) {
			this._dockNode = overlay;
			this._dockBindOverlayBandZBump(band, direction);
			this._dockUpdateOverlayInsets();
			return { band, bandContent };
		}

		const created = this._dockCreateSplitNodes(direction);
		band = created.band;
		bandContent = created.bandContent;
		const divider = created.divider;
		if (!band || !bandContent) return {};

		// Default size for the band (can be resized by divider)
		const defaultW = 260;
		const defaultH = 200;
		if (direction === "left" || direction === "right") {
			band.style.width = band.style.width || defaultW + "px";
		} else {
			band.style.height = band.style.height || defaultH + "px";
		}

		overlay.append(band);
		this._dockBindOverlayBandZBump(band, direction);
		this._dockNode = overlay;
		this._attachDockDividerResize(divider, null, band, bandContent, direction);
		this._applyDockAutoHide(band);
		this._dockUpdateOverlayInsets();
		return { band, bandContent };
	};

	_recomputeDockNode = () => {
		this.ensureInnerDesktop();
		if (!this.innerRoot || !this.floatLayer) return;
		// Overlay mode: dock node is the overlay root.
		this._dockNode = this._dockGetOverlayRoot() || this.floatLayer;
	};

	_cleanupEmptyDockFrom = (node) => {
		// node: a descendant of sweDockBand (usually bandContent)
		if (!node) return;
		const band = this._dockGetBandFromNode(node);
		if (!band) return;
		const bandContent = this._dockGetBandContent(band);
		if (!bandContent) return;
		if (bandContent.children.length > 0) return;
		band.remove();
		this._dockUpdateOverlayInsets();
	};

	_applyDockAutoHide = (band) => {
		this._dockBindUndockFromTab(band);
		this._dockBindToggleAutoHideFromTab(band);
		this._dockBindScrollToStartFromTab(band);
		const resolved = this._dockResolveAutoHide(band);
		band.classList.toggle("autoHide", !!resolved);
		this._dockUpdateOverlayInsets();
		const trigger = this._dockAutoHideTrigger;
		if (trigger === "click") this._dockBindAutoHideClick(band);
		else if (trigger === "hover") this._dockBindAutoHideHover(band);
	};

	_attachDockDividerResize = (divider, split, band, bandContent, side) => {
		let dragging = false;
		let start = 0;
		let startSize = 0;
		const isRow = this._dockIsRowSide(side);
		const bandMin = this.scInst?.config?.dock?.bandMin ?? 120;
		const bandMax = this.scInst?.config?.dock?.bandMax ?? 600;
		const mainMin = this.scInst?.config?.dock?.mainMin ?? 200;
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		let dividerSize = 4;
		let activePointerId = null;
		let lastClientX = null;
		let lastClientY = null;

		// bandContent は残りを埋める
		if (bandContent) {
			bandContent.style.flex = "1 1 auto";
			bandContent.style.flexBasis = "auto";
			bandContent.style.width = "";
			bandContent.style.height = "";
		}

		divider.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			dragging = true;
			band.__sweResizing = true;
			band.classList.add("sweDockResizing");
			band.classList.add("sweDockAutoHideResizing");
			lastClientX = e.clientX;
			lastClientY = e.clientY;
			this._dockAutoHideCancelClose(band);
			if (band.classList.contains("autoHide")) {
				this._dockSetBandExpanded(band, true);
			}
			activePointerId = e.pointerId;
			divider.setPointerCapture(e.pointerId);
			dividerSize = isRow ? (divider.offsetWidth || 4) : (divider.offsetHeight || 4);
			start = isRow ? e.clientX : e.clientY;
			startSize = isRow ? band.offsetWidth : band.offsetHeight;
			window.addEventListener("pointermove", onMove, true);
			window.addEventListener("pointerup", onUp, true);
			window.addEventListener("pointercancel", onUp, true);
		});

		const onMove = (e) => {
			if (!dragging) return;
			if (activePointerId !== null && e.pointerId != null && e.pointerId !== activePointerId) return;
			e.preventDefault();
			lastClientX = e.clientX;
			lastClientY = e.clientY;
			const d = (isRow ? e.clientX : e.clientY) - start;
			let next = startSize;
			if (side === "right" || side === "bottom") next = startSize - d;
			else next = startSize + d;

			const overlay = this._dockGetOverlayRoot();
			const containerSize = isRow ? (overlay?.clientWidth ?? 0) : (overlay?.clientHeight ?? 0);
			const maxByMain = Math.max(bandMin, containerSize - mainMin);
			const cappedMax = Math.min(bandMax, maxByMain);
			next = Math.max(bandMin, Math.min(cappedMax, next));

			if (isRow) {
				band.style.width = next + "px";
			} else {
				band.style.height = next + "px";
			}
			this._dockUpdateOverlayInsets();
		};

		const onUp = (e) => {
			if (!dragging) return;
			if (activePointerId !== null && e.pointerId != null && e.pointerId !== activePointerId) return;
			dragging = false;
			activePointerId = null;
			band.__sweResizing = false;
			band.classList.remove("sweDockResizing");
			if (band.__sweAutoHideResizingTimer != null) {
				clearTimeout(band.__sweAutoHideResizingTimer);
				band.__sweAutoHideResizingTimer = null;
			}
			band.__sweAutoHideResizingTimer = setTimeout(() => {
				band.__sweAutoHideResizingTimer = null;
				band.classList.remove("sweDockAutoHideResizing");
			}, 900);
			// After resize, decide whether to keep expanded based on the last known pointer position.
			// This prevents ending up in tab-only state when the band boundary moved under the cursor.
			band.__sweAutoHideLockUntil = Date.now() + Math.max(240, closeDelayMs);
			this._dockAutoHideCancelClose(band);
			if (band.classList.contains("autoHide")) {
				band.__sweForceExpandedUntil = Date.now() + 900;
				this._dockSetBandExpanded(band, true);
				const x = Number.isFinite(e?.clientX) ? e.clientX : lastClientX;
				const y = Number.isFinite(e?.clientY) ? e.clientY : lastClientY;
				const br = band.getBoundingClientRect();
				const inside = Number.isFinite(x) && Number.isFinite(y)
					? (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom)
					: false;
				if (!inside) {
					this._dockAutoHideScheduleCloseAfterUnblock(band);
				}
			}
			lastClientX = null;
			lastClientY = null;
			try { divider.releasePointerCapture(e.pointerId); } catch { }
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("pointerup", onUp, true);
			window.removeEventListener("pointercancel", onUp, true);
			this._dockUpdateOverlayInsets();
		};

		divider.addEventListener("lostpointercapture", onUp);
	};

	dockChild = (childWin, side, insertAfterFrame = null) => {
		if (!childWin || childWin === this) return;
		this.ensureInnerDesktop();
		// childWin の inner desktop は、childWin 自身が子を持つ時だけ必要。
		// ここで生成すると content のスクロールが潰れるため遅延させる。

		const originParent = childWin.parentWin;
		const originBandContent = childWin.frNode?.closest?.(".sweDockBandContent");

		if (childWin.parentWin !== this) {
			childWin.attachToParent(this);
		}

		const { bandContent } = this._ensureDockSplit(side);

		// Save the floating size before docking overwrites it with sizing.
		childWin._dockLastFloatRect = { ...(childWin.rect ?? {}) };
		this._dockResetFrameForDock(childWin);
		// Prevent transition artifacts (from absolute top/left) that can look like overlaps.
		const prevTransition = childWin.frNode.style.transition;
		childWin.frNode.style.transition = "none";
		// Insert directly under the overlapped docked block (drop target). If none, append.
		const insertBefore = (insertAfterFrame && insertAfterFrame.parentElement === bandContent)
			? insertAfterFrame.nextSibling
			: null;
		this._reparentFrameToHost(childWin, bandContent, insertBefore);
		this._dockApplyDockedInlineLayout(childWin);
		const isHorizontalBand = side === "top" || side === "bottom";
		if (isHorizontalBand) {
			const rawW = childWin._dockLastFloatRect?.width ?? childWin.rect?.width;
			const w = Number.parseFloat(rawW) || childWin.frNode.offsetWidth || 360;
			childWin.frNode.style.width = w + "px";
			childWin.frNode.style.height = "100%";
		} else {
			const rawH = childWin._dockLastFloatRect?.height ?? childWin.rect?.height;
			const h = Number.parseFloat(rawH) || childWin.frNode.offsetHeight || 260;
			childWin.frNode.style.width = "100%";
			childWin.frNode.style.height = "";
			childWin.frNode.style.minHeight = h + "px";
		}
		childWin.frNode.style.flex = "0 0 auto";
		requestAnimationFrame(() => {
			childWin.frNode.style.transition = prevTransition;
		});
		childWin.setCurrentrect?.();
		childWin.frNode.classList.add("docked");
		childWin.frNode.classList.remove("sweChildInDockBand");
		if (childWin.wdNode) {
			childWin.wdNode.style.top = "0px";
			childWin.wdNode.style.height = "";
		}
		const band = bandContent.closest(".sweDockBand");
		this._dockRefreshTabIfNeeded(band);
		this._dockRefreshStackSeparators(bandContent);
		this._dockBindUndockFromTab(band);
		this._applyDockAutoHide(band);
		this._dockCleanupEmptyOriginBand(originParent, originBandContent);
		childWin.bringToFront?.();
	};

	undockToFloat = (childWin) => {
		if (!childWin || childWin.parentWin !== this) return;
		this.ensureInnerDesktop();
		const vr = childWin.frNode.getBoundingClientRect();
		const fromBandContent = childWin.frNode.closest?.(".sweDockBandContent");
		const fromBand = fromBandContent?.closest?.(".sweDockBand") ?? null;
		const wasActive = childWin.frNode.classList.contains("sweDockActive");
		childWin.frNode.classList.remove("docked");
		childWin.frNode.classList.remove("sweDockActive");
		if (childWin.wdNode && childWin.hdNode) {
			childWin.wdNode.style.top = childWin.hdNode.offsetHeight + "px";
		}
		this._dockClearDockedInlineLayout(childWin);
		childWin._teleportFrameToHostFromViewportRect({
			host: this.floatLayer,
			viewportRect: vr,
			bottomInset: 0,
			originParent: this,
			originBandContent: fromBandContent,
			cleanupOriginDock: true,
			afterTeleport: () => {
				this._setChildParentAndDockBandClass(childWin, this);
				this._dockRefreshTabIfNeeded(fromBand);
				// Restore the floating size if available.
				const r = childWin._dockLastFloatRect;
				if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) {
					childWin.frNode.style.width = r.width + "px";
					childWin.frNode.style.height = r.height + "px";
				}
			},
		});
	};

	_handleDropAfterMove = (e) => {
		if (!e) return;
		const x = e.clientX;
		const y = e.clientY;
		const ctrl = !!e.ctrlKey;
		const shift = !!e.shiftKey;
		const dockMode = shift;

		// No modifiers: if dropped onto a dock band, stack into that band.
		if (!ctrl && !shift) {
			const hitBand = this._findDockBandContentFromPoint(x, y);
			if (hitBand) {
				const hostFrame = hitBand.bandContent.closest?.(".sweWindowFrame");
				const hostWin = hostFrame?.sweWindow;
				const side = hitBand.band?.dataset?.side;
				const targetFrame = this._findDockedFrameInBandFromPoint(hitBand.bandContent, x, y);
				if (hostWin && side) {
					hostWin.dockChild(this, side, targetFrame);
				}
				return;
			}
			const parent = this._findParentWindowFromPoint(x, y);
			if (parent) {
				this.attachToParent(parent);
			}
			return;
		}

		// Ctrl: 親の外へ落としたら detach
		if (ctrl && this.parentWin) {
			const host = this.parentWin.floatLayer || this.parentWin.wdNode;
			if (host) {
				const pr = host.getBoundingClientRect();
				const inside = x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
				if (!inside) {
					this.detachToScreen();
					return;
				}
			}
		}

		// If dropped onto a docked window, stack into the same dock band.
		const hitBand = this._findDockBandContentFromPoint(x, y);
		if (hitBand) {
			const hostFrame = hitBand.bandContent.closest?.(".sweWindowFrame");
			const hostWin = hostFrame?.sweWindow;
			const side = hitBand.band?.dataset?.side;
			const targetFrame = this._findDockedFrameInBandFromPoint(hitBand.bandContent, x, y);
			if (hostWin && side) {
				hostWin.dockChild(this, side, targetFrame);
			}
			return;
		}

		const parent = this._findParentWindowFromPoint(x, y);
		if (parent) {
			const host = parent.floatLayer || parent.wdNode;

			// Shift: 端なら帯化（dock）。必要なら親へ attach してから dock。
			if (dockMode) {
				const side = parent._detectDockDirection(host, x, y);
				if (side) {
					parent.dockChild(this, side);
					return;
				}
			}

			// Ctrl: 親へ入れる（attach）
			if (ctrl) {
				this.attachToParent(parent);
				return;
			}
			return;
		}

		// Shift: dock 解除（帯→子）
		if (this.parentWin && dockMode && this._isDocked()) {
			const host = this.parentWin.floatLayer || this.parentWin.wdNode;
			const side = this.parentWin._detectDockDirection(host, x, y);
			if (!side) {
				this.parentWin.undockToFloat(this);
			}
		}
	};


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

		// 内部デスクトップ（子ウィンドウ用）は必要になった時だけ生成する（遅延）

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
		//		this.adjust_wdNode_height();

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
		} else if (this.content.kind === "html") {
			this.wdNode.innerHTML = String(this.content.value ?? "");
		} else if (this.content.kind === "text") {
			this.wdNode.textContent = String(this.content.value ?? "");
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
			const height = +this.rect.height;
			this.wdNode.style.height = height + (+styles.paddingTop.replace(/px/, '') + +styles.paddingBottom.replace(/px/, '')) + "px";
		} else {
			this.wdNode.style.height = this.frNode.style.height;
		}
		this.frNode.style.height = +this.wdNode.offsetHeight + +this.hdNode.offsetHeight + "px";

		// 幅
		if (this.rect.width) {
			this.wdNode.style.width = this.rect.width + (+styles.paddingLeft.replace(/px/, '') + +styles.paddingRight.replace(/px/, '')) + "px";
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
		//		console.log(`this.frNode.style.height`, +this.frNode.style.height.replace(/px/, ''));
		// ウィンドウのサイズ
		this.rect = {
			height: +this.frNode.style.height.replace(/px/, ''),
			width: +this.frNode.style.width.replace(/px/, ''),
			top: +this.frNode.style.top.replace(/px/, ''),
			left: +this.frNode.style.left.replace(/px/, '')
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
		// dock された子がアクティブになったら親チェーンもアクティブ化する
		// （attach しただけでは親をアクティブ化しない）
		if (this.parentWin && this.frNode?.classList?.contains("docked")) {
			this.parentWin.bringToFront?.();
		}
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
	adjust_wdNode_height = (calculatedHeight = null) => {
		if (
			this.frNode.classList.contains("maximizeAnim") ||
			this.frNode.classList.contains("minimizeAnim")
		) return;

		// calculatedHeight が渡されている場合はそれを使用し、
		// ない場合のみ clientHeight を参照してリフローを発生させる
		const frameHeight = calculatedHeight ?? this.frNode.clientHeight;
		const h = frameHeight - this.hdNode.offsetHeight;

		if (h > 0) {
			//this.wdNode.style.height = h + "px";
			this.wdNode.style.setProperty('--window-height', h + 'px');
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

		this.frNode.style.display = "flex";

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
			this.frNode.style.transform = "";
			this.frNode.style.opacity = "";
			this.frNode.classList.remove("restoreAnim");
			this.frNode.classList.remove("minimize");

			// ★ 重要：復元後に高さを再認識させる
			// 親が flex: column なら、子の .sweWindow は自動で広がるはずですが、
			// 万が一のために JS での高さ固定をクリアします。
			this.wdNode.style.height = "";

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

		this.frNode.style.display = "flex";
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
		this.frNode.style.display = "flex";

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
			ウィンドウの移動（GPU加速版）
	--------------------------------------------------*/
	moveWindow = () => {
		let dragging = false;
		let armed = false;
		let startLeft = 0, startTop = 0;
		let mousePos = { x: 0, y: 0 };
		let activePointerId = null;
		let currentDX = 0, currentDY = 0;
		let lastPointerEvent = null;

		const isBlocked = () =>
			this.frNode.classList.contains("maximize") ||
			this.frNode.classList.contains("minimize");

		const requestDraw = () => {
			// ドラッグ中のみ requestAnimationFrame で描画
			if (!dragging) return;
			requestAnimationFrame(() => {
				if (!dragging) return;
				this.frNode.style.transform = `translate(${currentDX}px, ${currentDY}px)`;
			});
		};

		const resetDragBaselineAfterTeleport = (e, hostNode = null) => {
			this.frNode.style.transform = "";
			mousePos = { x: e.clientX, y: e.clientY };
			const fr = this.frNode.getBoundingClientRect();
			const hr = hostNode?.getBoundingClientRect?.();
			if (hr) {
				startLeft = fr.left - hr.left;
				startTop = fr.top - hr.top;
			} else {
				startLeft = this.frNode.offsetLeft;
				startTop = this.frNode.offsetTop;
			}
			currentDX = 0;
			currentDY = 0;
			activePointerId = e.pointerId;
			try { this.hdNode.setPointerCapture(e.pointerId); } catch { }
		};

		this.hdNode.addEventListener("pointerdown", (e) => {
			if (e.button !== 0 || isBlocked()) return;
			if (e.target.closest(".sweWindowHeaderButtons")) return;
			// dock 中は通常操作を禁止（構造操作の Ctrl 系のみ許可）
			if (this.frNode.classList.contains("docked") && !(e.ctrlKey || e.shiftKey)) return;

			armed = true;
			dragging = false;
			activePointerId = e.pointerId;
			this.hdNode.setPointerCapture(e.pointerId);

			// 開始時のマウス位置を保存
			mousePos = { x: e.clientX, y: e.clientY };

			// 開始時のウィンドウの「実際のスタイル値」を取得
			// parseFloat(style.left) が取れない場合に備え getBoundingClientRect ではなく offsetLeft 等を使用
			startLeft = this.frNode.offsetLeft;
			startTop = this.frNode.offsetTop;

			currentDX = 0;
			currentDY = 0;
		});

		this.hdNode.addEventListener("pointermove", (e) => {
			if (!armed && !dragging) return;
			if (e.pointerId !== activePointerId) return;
			lastPointerEvent = e;

			const dx = e.clientX - mousePos.x;
			const dy = e.clientY - mousePos.y;

			if (armed && !dragging) {
				// 遊び（遊びがないとクリックだけで少し動いてしまう）
				if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
				dragging = true;
				armed = false;
				// Ctrl-drag on an attached child window: detach immediately so it becomes an external
				// window from the start of the drag (avoids waiting until the cursor exits the parent).
				if (e.ctrlKey && this.parentWin && !this._isDocked()) {
					this.detachToScreen();
					resetDragBaselineAfterTeleport(e, this.scInst?.scNode);
					// Prevent applying stale dx/dy (computed before teleport) in this same event.
					requestDraw();
					return;
				}
				// Ctrl/Shift drag from a dock band: undock first so the frame can stay above bands
				// and docking hit-tests continue to work.
				if ((e.shiftKey || e.ctrlKey) && this.parentWin && this._isDocked()) {
					this.parentWin.undockToFloat(this);
					resetDragBaselineAfterTeleport(e, this.parentWin?.floatLayer);
					requestDraw();
					return;
				}
				// When this is an attached child window, its z-index is constrained by the parent frame's
				// stacking context. Bring the parent to front too so the child can drag over dock bands.
				this.parentWin?.bringToFront?.();
				this.frNode.classList.add("dragging");
				this.bringToFront?.();
			}

			if (dragging) {
				currentDX = dx;
				currentDY = dy;

				// Ctrl ドラッグ中、親の外へ出たら自動 detach（ドラッグ継続）
				if (e.ctrlKey && this.parentWin) {
					const host = this.parentWin.floatLayer || this.parentWin.wdNode;
					if (host) {
						const pr = host.getBoundingClientRect();
						const margin = 16;
						const outside =
							e.clientX < pr.left - margin ||
							e.clientX > pr.right + margin ||
							e.clientY < pr.top - margin ||
							e.clientY > pr.bottom + margin;
						if (outside) {
							// 現在の transform を viewportRect に反映させたまま screen に戻す
							this.detachToScreen();
							resetDragBaselineAfterTeleport(e, this.scInst?.scNode);
						}
					}
				}

				requestDraw();
			}
		});

		const endDrag = (e) => {
			if (e && activePointerId !== e.pointerId) return;

			if (activePointerId !== null) {
				try { this.hdNode.releasePointerCapture(activePointerId); } catch { }
				activePointerId = null;
			}

			if (armed) { armed = false; return; }
			if (!dragging) return;

			dragging = false;
			this.frNode.classList.remove("dragging");

			// --- 座標の確定処理 ---
			const finalX = startLeft + currentDX;
			const finalY = startTop + currentDY;

			// transition による「吸い込み」を防止
			const originalTransition = this.frNode.style.transition;
			this.frNode.style.transition = "none";

			// top/left を更新し transform を消す
			this.frNode.style.left = finalX + "px";
			this.frNode.style.top = finalY + "px";
			this.frNode.style.transform = "";

			// 強制リフロー
			this.frNode.offsetHeight;

			// transition を復元
			this.frNode.style.transition = originalTransition;

			this.setCurrentrect?.();
			this._handleDropAfterMove?.(e);
		};

		this.hdNode.addEventListener("pointerup", endDrag);
		this.hdNode.addEventListener("pointercancel", endDrag);
		this.hdNode.addEventListener("lostpointercapture", endDrag);
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

			// addResizeParts 内の applyResize を修正
			const applyResize = () => {
				if (pending) return;
				pending = true;

				requestAnimationFrame(() => {
					if (nextW !== null) this.frNode.style.width = nextW + "px";
					if (nextLeft !== null) this.frNode.style.left = nextLeft + "px";
					if (nextH !== null) this.frNode.style.height = nextH + "px";
					if (nextTop !== null) this.frNode.style.top = nextTop + "px";

					// ★ 修正ポイント: 計算済みの nextH を渡す
					// nextH が null（横方向のみのリサイズ）の場合は、現在の rect.height を使用
					//					this.adjust_wdNode_height(nextH ?? this.rect.height);

					pending = false;
				});
			};

			// 掴む
			resizer.addEventListener("pointerdown", (e) => {
				// dock 中はリサイズさせない
				if (this.frNode.classList.contains("docked")) return;

				dragging = true;

				// 軽量モード ON
				this.frNode.classList.add("resizing");
				this.scNode.classList.add("unselectable");

				this.frNode.setPointerCapture(e.pointerId);

				startMouse.x = e.clientX;
				startMouse.y = e.clientY;

				// Always base resize on the current DOM rect to avoid drift when this.rect is stale.
				const fr = this.frNode.getBoundingClientRect();
				const sr = this.scNode.getBoundingClientRect();
				startPos.x = fr.left - sr.left;
				startPos.y = fr.top - sr.top;
				startSize.w = fr.width;
				startSize.h = fr.height;

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
						if (nextW != null && this.minSize.width) {
							nextW = nextW < this.minSize.width ? this.minSize.width : nextW;
						}
						if (nextH != null && this.minSize.height) {
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

					// Persist the final rect so the next resize starts from the correct baseline.
					this.setCurrentrect?.();

					// コンテンツの高さ調整
					//					this.adjust_wdNode_height();

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
