




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
		// 属性値（文字列）を数値へ変換（空/未指定は null）
		return (v == null || v === "") ? null : Number(v);
	};

	DEFAULT_CONFIG = {
		// sweScreen 全体のデフォルト設定
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
		// 画面（スクリーン）要素を確定する
		// - 文字列: セレクタ
		// - null: document.body
		// - Node: そのまま使う
		// 初期化: scNode を確定
		// 外部コール: document.querySelector
		this.scNode = typeof screen === "string"
			? document.querySelector(screen)
			: (screen === null ? document.body : screen);

		//		this.configMerge = this.mergeConfig;
		// 設定のマージ関数（実装切替用のフック）
		// 初期化: 設定のマージ関数（実装切替用のフック）
		this.configMerge = this.objectMerge;

		// 初期化完了まで待てる Promise（呼び出し側で await できるようにする）
		// 外部コール: 非同期初期化（呼び出し側で await 可能）
		this.ready = (async () => {
			// 初期ビルド（DOMから sweWindow を構築）
			await this.buildAllWindows(config);
			this.initBuild = true;
			return this;
		})();

	}



	/*--------------------------------------------------
		初期ウィンドウの構築
	--------------------------------------------------*/
	buildAllWindows = (config) => {
		// 設定をデフォルトとマージ
		this.config = this.configMerge(this.DEFAULT_CONFIG, config);
		//console.log("Screen Config", JSON.stringify(this.config));

		// scNode がまともなノードじゃなければ何もしない
		// 分岐: scNode が Element でなければ中断
		if (!this.scNode || this.scNode.nodeType !== 1) return;

		// 初期構築中は一旦非表示（ちらつき防止）
		// 外部コール: class 操作（ちらつき防止）
		this.scNode.classList.add("invisible");
		// 逆参照（イベントなどから screen インスタンスへ辿れるように）
		// 初期化: 逆参照を付与
		this.scNode.sweScreen = this;
		// 外部イベントをバインド
		this._bindWheelPanGuard();
		this._bindHorizontalScrollClamp();

		// .sweTaskbar がなければ作る
		// 分岐: .sweTaskbar が無ければ生成
		if (!this.scNode.querySelector(".sweTaskbar")) {
			// 外部コール: document.createElement
			this.tbNode = document.createElement("div");
			this.tbNode.classList.add("sweTaskbar");
			this.scNode.append(this.tbNode);
		}

		// sweWindow を集める（直下の .sweWindow だけ）
		// 外部コール: querySelectorAll（直下の .sweWindow を対象）
		const wds = this.scNode.querySelectorAll(":scope > .sweWindow");
		if (!wds.length) {
			// 対象がないなら表示だけ戻す
			this.scNode.classList.remove("invisible"); // 一応戻しておくなら
			return;
		}

		// DOM からウィンドウ群を生成して起動
		this.openWindows(wds);
	}


	openWindows = (wds = null) => {
		if (!wds) return;

		/*--------------------------------------------------
			ウィンドウ群を生成して起動
		--------------------------------------------------*/
		// NodeList → 配列 にして map（全ウィンドウの build を待つ）
		let focus;
		// 外部コール: Promise.all（全ウィンドウの init を待つ）
		Promise.all(
			[...wds].map(async (sww) => {
				// 外部コール: 各 .sweWindow を sweWindow インスタンスに変換
				await this.buildWindow(sww);
			})
		).then(instances => {
			// 初期構築完了で表示を戻す
			// 外部コール: class 操作（表示復帰）
			this.scNode.classList.remove("invisible");
			// 最初にフォーカスするウィンドウを決める
			// 分岐: 初期フォーカス指定があればそれを前面化
			if ((typeof focus === "Boolean" && focus) || (typeof focus === "string" && focus === "true")) {
				focus.sweWindow.bringToFront();
			}
			else {
				// 分岐: 指定が無ければ最後のウィンドウを前面化
				this.windows[this.windows.length - 1].bringToFront();
			}
		});

		// 外部コール: 画面サイズイベントをバインド（初回のレイアウト調整含む）
		this.resizeScreenEvent();
	};

	/*--------------------------------------------------
		画面スクロール/パン抑止（ホイール）
	--------------------------------------------------*/
	_bindWheelPanGuard = () => {
		// 二重バインド防止
		if (this.__sweWheelPanGuardBound) return;
		this.__sweWheelPanGuardBound = true;
		// 外部イベント: wheel
		window.addEventListener(
			"wheel",
			(e) => {
				if (!e || !this.scNode) return;
				if (!this.scNode.contains(e.target)) return;
				// 方向を見て水平ジェスチャを抑止
				const dx = Number(e.deltaX) || 0;
				const dy = Number(e.deltaY) || 0;
				// Suppress horizontal pan gestures; keep vertical scrolling intact.
				if (Math.abs(dx) < 0.5) return;
				if (Math.abs(dx) <= Math.abs(dy) * 0.2) return;
				// cancelable の場合のみ preventDefault
				if (e.cancelable) e.preventDefault();
				e.stopPropagation();
			},
			{ passive: false, capture: true }
		);
	};

	/*--------------------------------------------------
		画面の横スクロールを常に0へ戻す（保険）
	--------------------------------------------------*/
	_bindHorizontalScrollClamp = () => {
		// 二重バインド防止
		if (this.__sweHorizontalScrollClampBound) return;
		this.__sweHorizontalScrollClampBound = true;
		let scheduled = false;
		// rAF 内で実行するクランプ処理
		const clamp = () => {
			scheduled = false;
			const de = document.documentElement;
			const b = document.body;
			// 横スクロールを戻す（document/ body 両方をケア）
			if (de && de.scrollLeft) de.scrollLeft = 0;
			if (b && b.scrollLeft) b.scrollLeft = 0;
			if (window.scrollX) window.scrollTo(0, window.scrollY);
		};
		// 外部イベント: scroll
		document.addEventListener(
			"scroll",
			(e) => {
				if (!this.scNode) return;
				const t = e?.target;
				// 画面外のスクロールイベントなら無視
				if (t && t.nodeType === 1 && !this.scNode.contains(t)) return;
				const de = document.documentElement;
				const b = document.body;
				if (!de && !b) return;
				const hasX = (de && de.scrollLeft) || (b && b.scrollLeft);
				if (!hasX) return;
				// 同フレーム内での多重実行を防ぐ
				if (scheduled) return;
				scheduled = true;
				// 外部コール: rAFで後処理
				requestAnimationFrame(clamp);
			},
			true
		);
	};



	buildWindow = (sww) => {
		//		console.log(sww);
		/*--------------------------------------------------
			単一ウィンドウをDOM宣言から構築
		--------------------------------------------------*/
		// DOM属性から設定をパース
		// 外部コール: 宣言属性のパース
		const parsedConfig = this._parseWindowDecl(sww);
		if (parsedConfig) {
			// Screen 設定と Window 宣言のマージ
			//const config = this.configMerge(this.config, parsedConfig);
			const config = this.configMerge(this.config, parsedConfig);
			// 初期フォーカス指定
			if (config.focus) { focus = sww; }
			// 管理番号
			const wn = this.windows.length;
			// sweWindow インスタンス化
			sww.sweWindow = new sweWindow(sww, this, wn);
			// IDで引けるように登録
			this.registerWindow(sww.sweWindow, config.windowId);
			// 外部コール: 初期化
			return sww.sweWindow.init(config);
		}
	}


	/**
	 * 
	 */
	/*--------------------------------------------------
		.sweWindow の宣言属性をパースして設定化
	--------------------------------------------------*/
	_parseWindowDecl = (sww) => {
		// .sweWindow の宣言属性を読み取り、sweWindow.init 用の設定オブジェクトへ変換
		// - windowId/title/rect/type/flags/content などを解決
		// ウィンドウIDの決定（未指定なら自動採番）
		const windowId = this._resolveWindowId(sww);
		if (!windowId) { return; }

		// タイトル
		const windowTitle = sww.getAttribute("window-title") || "";

		// 初期位置/サイズ
		const rect = this._resolveAttributeRect(sww);

		// コンテンツ種別と初期状態
		const type = sww.getAttribute("type") || this.config.type;
		const startStatus = sww.getAttribute("start-status") || this.config.startStatus;
		const focus = sww.getAttribute("focus") || this.config.focus;

		// 属性値から真偽値へ（未指定は def）
		const bool = (name, def = true) => {
			const v = sww.getAttribute(name);
			if (v == null) return def;
			return v !== "false";
		};

		// 操作フラグ
		const flags = {
			resizable: bool("resizable", this.config.resizable),
			movable: bool("movable", this.config.movable),
			closable: bool("closable", this.config.closable),
			minimizable: bool("minimizable", this.config.minimizable),
			maximizable: bool("maximizable", this.config.maximizable),
		};

		// 最小サイズ
		const minSize = {
			width: this._num(sww.getAttribute("min-width")) ?? this.config.minSize.width,
			height: this._num(sww.getAttribute("min-height")) ?? this.config.minSize.height
		};

		// コンテンツ指定（url/html/node の優先順）
		const url = sww.getAttribute("url");
		const html = sww.getAttribute("html");
		let content = null;

		if (url) content = { kind: "url", value: url };
		else if (html) content = { kind: "html", value: html };
		else content = { kind: "node", value: sww };

		// 役目を終えた宣言属性を消す（以後はJS側が管理）
		// 外部コール: DOM 属性削除
		this._removeAttributes(sww);

		return { windowId, windowTitle, rect, type, minSize, focus, startStatus, flags, content };
	};


	/**
	 * 
	 * @param {*} sww 
	 * @returns 
	 */
	/*--------------------------------------------------
		宣言用属性を削除
	--------------------------------------------------*/
	_removeAttributes = (sww) => {
		// 宣言用の属性を削除（初期化後は JS が状態を管理する）
		// ループ: 対象属性をすべて remove
		for (let attr of this.attributes) {
			// 外部コール: removeAttribute
			sww.removeAttribute(attr);
		}
	}


	/**
	 * 
	 */
	/*--------------------------------------------------
		属性から矩形（top/left/width/height）を解決
	--------------------------------------------------*/
	_resolveAttributeRect = (sww) => {
		// 属性の top/left/width/height を読み取り rect を作る（未指定は null）

		// 初期値は属性から（未指定は null）
		const rect = {
			top: this._num(sww.getAttribute("top")),
			left: this._num(sww.getAttribute("left")),
			width: this._num(sww.getAttribute("width")),
			height: this._num(sww.getAttribute("height")),
		};

		// 足りない値をデフォルトで補完
		// 外部コール: rect の補完
		return this._resolveRect(rect);
	}


	/*--------------------------------------------------
		矩形をデフォルト値で補完し、最小サイズを保証
	--------------------------------------------------*/
	_resolveRect = (rect) => {
		// rect の未指定値をデフォルトで補完し、最小サイズを保証する
		// - 自動配置は rectSlide で少しずつずらす
		let rc = false;
		if (!rect.top) {
			// 未指定ならデフォルト＋スライドオフセット
			rect.top = this.config.rect.top + this.rectSlide;
			rc = true;
		}
		if (!rect.left) {
			// 未指定ならデフォルト＋スライドオフセット
			rect.left = this.config.rect.left + this.rectSlide;
			rc = true;
		}
		if (rc) {
			// 次回の自動配置をずらす
			this.rectSlide += 50;
			//console.log("this.rectSlide", this.rectSlide);
		}
		// 最小サイズを保証
		// 分岐: 幅/高さが小さければ minSize へ
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
	/*--------------------------------------------------
		window-id の解決
	--------------------------------------------------*/
	_resolveWindowId(sww) {
		// window-id を解決（宣言指定 or UUID）
		let id;
		if (sww.getAttribute("window-id")) {
			// 宣言で指定された ID を使用
			id = sww.getAttribute("window-id");
		}
		else {
			// 未指定なら UUID
			// 外部コール: crypto.randomUUID
			id = "win-" + crypto.randomUUID();
		}

		// 重複ポリシーに従って調整
		id = this._resolveDupWindowId(id);

		return id;
	}


	_resolveDupWindowId = (id, idDup = null) => {
		// window-id の重複をポリシー（idDup）に従って解決
		//console.log("this.winById.id", id);
		//console.log("this.winById.has.id", this.winById.has(id));
		idDup = idDup ?? this.config.idDup;
		//console.log("idDup", idDup);
		// ID重複
		if (this.winById.has(id)) {
			// 分岐: 重複時の処理
			//console.log("idDup", this.config.idDup);
			switch (idDup) {
				case "replace":
					// 既存を閉じて置き換える
					const old = this.winById.get(id);
					//console.log(id, old);
					// 外部コール: close
					this.closeWin(old);
					break;
				case "newid":
					// 新しい ID を発行
					// 外部コール: crypto.randomUUID
					id = "win-" + crypto.randomUUID();
					break;
				case "error":
				default:
					// エラーとして扱い、生成を止める
					// 外部コール: console.error
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
		// window-id から sweWindow インスタンスを取得
		return this.winById.get(id) || null;
	}



	/*--------------------------------------------------
		Get Window by Id
	--------------------------------------------------*/
	getWindow(id) {
		// window-id から frameNode を取得（DOM要素）
		return this.winById.get(id).frNode || null;
	}


	/*--------------------------------------------------
		Attach Screen Resize Event
	--------------------------------------------------*/
	resizeScreenEvent = () => {
		// 外部イベント: ResizeObserver で画面サイズ変化を監視
		// 外部コール: new ResizeObserver
		const observer = new ResizeObserver(this.__resizeCallback);
		// 外部コール: observe
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
		// ウィンドウを管理対象として登録
		// - windows: Z順（配列順）
		// - winById: window-id → instance
		this.windows.push(win);
		this.winById.set(id, win);
	}



	/*--------------------------------------------------
		Reorder Z-index
	--------------------------------------------------*/
	reorderZ(win = null, focus = true) {
		// Z-index を配列順に振り直し、必要なら対象ウィンドウを最前面へ
		// - win=null: 現在順を維持して詰める
		// - win指定: その win を末尾（最前面）へ移動

		// ---- 引数なし：詰めるだけ（順番は変えない）----
		if (!win) {
			// ループ: 末尾→先頭へ向けて z-index を詰める
			const last = this.windows.length - 1;
			for (let i = last; i >= 0; i--) {
				// 外部コール: z-index 設定
				this.windows[i].setZindex(i);
			}
			return;
		}

		const from = this.windows.indexOf(win);
		if (from < 0) return;

		const last = this.windows.length - 1;
		if (from === last) return; // 既に最前面

		// 1) 配列の順番入れ替え：active を末尾へ
		// 外部コール: 配列操作
		this.windows.splice(from, 1);
		this.windows.push(win);

		// 2) z-index 更新：影響範囲は from..last（大→小で更新）
		// ループ: 更新が必要な範囲だけ再設定
		for (let i = last; i >= from; i--) {
			// 外部コール: z-index 設定
			this.windows[i].setZindex(i);
		}

		// 最前面化（必要なら）
		// 分岐: focus=true の場合は bringToFront
		if (focus) { this.windows[last].bringToFront?.(); console.log("HEN"); }

	}



	/*--------------------------------------------------
		Window Controll
	--------------------------------------------------*/
	ctrlWin = (target = null, action = null) => {
		// 外部操作（taskbar 等）から window-id を指定して操作する
		if (!target || !action) return;

		// 外部コール: window-id → instance
		const wininst = this.getWindowInstance(target);

		if (wininst) {
			// 分岐: 操作種別で処理を振り分け
			switch (action) {
				case "focus":
					// 外部コール: 前面化
					wininst.bringToFront();
					break;
				case "maximize":
					// 外部コール: サイズ変更
					wininst.resizeWindow("maximize");
					break;
				case "minimize":
					// 外部コール: サイズ変更
					wininst.resizeWindow("minimize");
					break;
				case "close":
					// 外部コール: close
					this.closeWin(wininst);
			}
		}
	};


	/*----------------------------------------------------
		Close Window
	----------------------------------------------------*/
	closeWin = (win = null) => {
		// ウィンドウを close し、管理リストから除外する
		if (!win) return;
		// 外部コール: close（Promise）
		win.closeWindow().then(p => {
			//console.log("win", win);
			// 外部コール: 登録解除
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
		// 管理リストからウィンドウを除外し、Z順を詰め直す
		// 外部コール: Map/Array 操作
		this.winById.delete(win.id);
		const i = this.windows.indexOf(win);
		if (i >= 0) this.windows.splice(i, 1);
		// 外部コール: Z の再整列
		this.reorderZ();
	}


	/*----------------------------------------------------
		UnRegister Window
	----------------------------------------------------*/
	createWindow = async (opts = null) => {
		// 動的にウィンドウを追加生成する
		// - opts=null: DOM から再スキャン
		// - opts=Element: その要素を build
		// - opts=object: 宣言に相当する設定を元に生成
		if (!opts) {
			// 分岐: 既存DOMを再ビルド
			this.buildAllWindows();
			return;
		}

		if (opts instanceof Element) {
			// 分岐: Element をそのまま build
			await this.buildWindow(opts);
			return;
		}

		// 初期化: window-id の重複を解決
		opts.windowId = this._resolveDupWindowId(opts.windowId, opts.idDup);
		if (!opts.windowId) return;

		// 外部コール: DOM 생성
		const sww = document.createElement("div");
		sww.classList.add("sweWindow");
		this.scNode.append(sww);
		//console.log("rect1", JSON.stringify(opts.rect));
		// 外部コール: rect の補完
		opts.rect = this._resolveRect(opts.rect);
		//console.log("rect2", JSON.stringify(opts.rect));
		// 初期化: Screen config と opts をマージ
		const config = this.configMerge(this.config, opts);
		//console.log("config", JSON.stringify(config));
		// 初期化: 管理番号
		const wn = this.windows.length;
		// 初期化: sweWindow インスタンス化
		sww.sweWindow = new sweWindow(sww, this, wn);
		// 外部コール: 登録
		this.registerWindow(sww.sweWindow, config.windowId);
		// 初期化: アニメ開始フラグ
		config.startAnimation = true;
		// 外部コール: init
		await sww.sweWindow.init(config);
		if (config.focus) {
			// 分岐: 初期フォーカス
			sww.sweWindow.bringToFront();
		}
	}


	/*--------------------------------------------------
			高速版 mergeConfig (structuredClone 代替)
	--------------------------------------------------*/
	mergeConfig = (target, source) => {
		// 高速版の設定マージ（structuredClone の代替）
		// - 連想配列は再帰的にマージ
		// - 配列は上書き（コピー）
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

		// ループ: source のキーを順にマージ
		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = output[key];

			// 両方がオブジェクト（プレーンな連想配列）なら再帰的にマージ
			if (
				sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
				targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
			) {
				// 分岐: 両方 plain object → 再帰
				output[key] = this.mergeConfig(targetValue, sourceValue);
			} else {
				// 分岐: 配列/プリミティブは上書き（コピー）
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
		// 複数オブジェクトを deep merge する
		// - plain object のみ対象
		// - 配列は上書き（deep copy）
		const isPlainObject = (v) => {
			if (v === null || typeof v !== "object") return false;
			const proto = Object.getPrototypeOf(v);
			return proto === Object.prototype || proto === null;
		};

		const cloneValue = (v) => {
			// 値を deep copy（plain object/array のみ）
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
			// dst に src をマージ
			if (src == null) return dst;

			// ループ: src のキーを順に処理
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
		// ループ: sources を順にマージ
		for (const src of sources) {
			if (src == null) continue;

			// src が plain object じゃないのを混ぜるのは事故りやすいので無視（必要ならここは方針変更）
			if (!isPlainObject(src)) continue;

			out = mergeInto(out, src);
		}
		return out;
	}



	showWinById = (id = null) => {
		// window-id を指定して表示（内部的には _showWinById を呼ぶ）
		if (!id) {
			// 分岐: id 未指定なら全て
			for (const [key, value] of this.winById) {
				this._showWinById(key);
			}
		}
		else {
			// 分岐: 単一
			this._showWinById(id);
		}
	}


	_showWinById = (id = null) => {
		// 指定 id のウィンドウを表示（実処理は未実装/拡張用）
		if (!this.winById.has(id)) return;

		//console.log(id, this.winById.get(id).title);

	}



}










class sweWindow {

	wdNode;	// Window Node（本文要素）
	frNode;	// Frame Node（外枠）
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

	/*--------------------------------------------------
		Dock: z-index（CSS変数）取得
	--------------------------------------------------*/
	_dockGetDockTabZIndex = () => {
		// タブ（矢印/タブ領域）を常に最前面にするための z-index
		const raw = getComputedStyle(document.documentElement).getPropertyValue("--sweZOverlayDockTab");
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? n : 200000;
	};

	_dockGetOverlayFloatLayerZIndex = () => {
		// 子ウィンドウ（float layer）の z-index
		const raw = getComputedStyle(document.documentElement).getPropertyValue("--sweZOverlayFloatLayer");
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? n : 1000;
	};

	_dockGetOverlayDockBandZIndex = () => {
		// ドッキング帯（band）のベース z-index
		const raw = getComputedStyle(document.documentElement).getPropertyValue("--sweZOverlayDockBand");
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? n : 900;
	};

	_dockSetBandZIndex = (band, z) => {
		// band の inline z-index を設定/クリアする
		if (!band) return;
		band.style.zIndex = z == null ? "" : String(z);
	};

	_dockSetTabZIndex = (band, z) => {
		// tab の inline z-index を設定/クリアする
		if (!band) return;
		const tab = this._dockGetTab?.(band);
		if (tab) tab.style.zIndex = z == null ? "" : String(z);
	};

	_dockAutoHideEnsureTabOnTop = (band) => {
		// autoHide 中は band を上げない（floatLayerより下）/ tab だけ最前面に保つ
		if (!band) return;
		this._dockSetBandZIndex(band, null);
		this._dockSetTabZIndex(band, this._dockGetDockTabZIndex());
	};

	_dockAutoHideRequestInsetUpdate = () => {
		// インセット（dockの占有領域）を更新
		// CSS遷移直後のサイズ確定も拾うため rAF で再計算する
		this._dockUpdateOverlayInsets();
		requestAnimationFrame(() => this._dockUpdateOverlayInsets());
	};

	_dockClearBandAndTabZIndex = (band) => {
		// inline の z-index を band/tab から両方クリアする
		if (!band) return;
		this._dockSetBandZIndex(band, null);
		this._dockSetTabZIndex(band, null);
	};

	_clearTimeoutField = (obj, field) => {
		if (!obj) return;
		const t = obj[field];
		if (t != null) {
			clearTimeout(t);
			obj[field] = null;
		}
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

	/*--------------------------------------------------
		Dock: 帯（band）DOMを生成
	--------------------------------------------------*/
	_dockCreateBand = (side) => {
		// band: ドッキング帯コンテナ
		const band = document.createElement("div");
		band.classList.add("sweDockBand");
		// 初期状態（side/autoHide）を付与
		band.dataset.side = side;
		band.dataset.autoHide = "false";
		// band 自体は floatLayer より前に出さない（必要時は CSS/クランプで制御）
		this._dockSetBandZIndex(band, null);

		// tab: 操作タブ（タイトル/矢印）
		const tab = document.createElement("div");
		tab.classList.add("sweDockTab");

		// divider: 境界リサイズ用のドラッグ領域
		const divider = document.createElement("div");
		divider.classList.add("sweDockDivider");
		divider.setAttribute("role", "separator");
		divider.dataset.side = side;

		// bandContent: ドッキングされたウィンドウフレームの格納先
		const bandContent = document.createElement("div");
		bandContent.classList.add("sweDockBandContent");
		// 外部イベント: wheel が画面全体へ波及しないように隔離
		this._dockBindBandContentWheelIsolation(band, bandContent);

		// 要素の並び順を side に応じて組み立て
		this._dockAppendBandChildren(band, tab, divider, bandContent, side);

		return { band, tab, divider, bandContent };
	};

	_dockCreateSplitNodes = (direction) => {
		// overlay mode: split は作らず、band 一式だけを生成して返す
		// _ensureDockSplit() は戻り値の { band, divider, bandContent } を使用して overlay へ append する
		const created = this._dockCreateBand(direction);
		return {
			band: created?.band ?? null,
			tab: created?.tab ?? null,
			divider: created?.divider ?? null,
			bandContent: created?.bandContent ?? null,
			split: null,
			main: null,
		};
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
		// タブの active 状態更新（アクティブな docked frame に対応する tab item を強調）
		if (!band) return;
		const tab = this._dockGetTab(band);
		const bandContent = this._dockGetBandContent(band);
		if (!tab || !bandContent) return;
		const active = this._dockGetActiveDockedFrame(bandContent);
		const items = Array.from(tab.querySelectorAll(":scope > .sweDockTabItem"));
		// ループ: すべてのタブ項目を走査して active を付け替える
		for (const it of items) {
			const winid = it.dataset.winid;
			const isActive = !!(active?.sweWindow && (String(active.sweWindow.winid || active.sweWindow.title || "") === String(winid)));
			it.classList.toggle("active", isActive);
		}
	};

	_dockRemoveTabItem = (band, childWin) => {
		// タブ項目の削除（子ウィンドウが band から外れた時）
		if (!band || !childWin) return;
		const tab = this._dockGetTab(band);
		if (!tab) return;
		// 初期化: winid / title などから tab item の識別子を決める
		const id = childWin.winid || childWin.title || "dock";
		const item = tab.querySelector(`:scope > .sweDockTabItem[data-winid="${CSS.escape(String(id))}"]`);
		// 外部コール: DOM の削除
		item?.remove?.();
		this._dockRefreshTabPresentation(band);
	};

	_dockGetSplitFromBand = (band) => {
		// band から split ノードを逆引き（splitモード互換用）
		return band?.closest?.(".sweDockSplit") ?? null;
	};

	_dockGetMainFromSplit = (split) => {
		// split 直下の main（本文）領域を取得（splitモード互換用）
		return split?.querySelector?.(":scope > .sweDockMain") ?? null;
	};

	_dockCollapseSplitIfNeeded = (split) => {
		// split が不要になった場合に縮退（子が1つならそれを繰り上げ）
		if (!split) return;
		const main = this._dockGetMainFromSplit(split);
		if (!main) return;
		const survivor = main.firstElementChild;
		if (survivor) {
			// 分岐: main に要素が残っていれば split を置換
			split.replaceWith(survivor);
		} else {
			// 分岐: 空なら floatLayer を innerRoot へ戻して split を削除
			this.innerRoot?.append(this.floatLayer);
			split.remove();
		}
		// 外部コール: dock node の再計算
		this._recomputeDockNode();
	};

	_dockResolveAutoHide = (band) => {
		// autoHide 設定の解決（inherit/true/false）
		const mode = band?.dataset?.autoHide ?? "inherit";
		return mode === "inherit" ? this._dockAutoHideDefault : mode === "true";
	};

	_dockBindUndockFromTab = (band) => {
		// タブから undock を行う操作をバインド（Shift+pointerdown）
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweUndockBound) return;
		tab.__sweUndockBound = true;
		tab.addEventListener("pointerdown", (e) => {
			// 分岐: Shift 以外は無視（他操作と干渉しない）
			if (!e.shiftKey) return;
			e.preventDefault();
			e.stopPropagation();
			const bandContent = this._dockGetBandContent(band);
			// 外部コール: active frame の取得
			const fr = this._dockGetActiveDockedFrame(bandContent);
			const child = fr?.sweWindow;
			if (!child) return;
			// 外部コール: 帯→浮動へ戻す
			this.undockToFloat(child);
		});
	};

	_dockBindScrollToStartFromTab = (band) => {
		// タブクリックでスクロール先頭へ移動（stacked時の操作補助）
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweScrollToStartBound) return;
		tab.__sweScrollToStartBound = true;
		tab.addEventListener("pointerdown", (e) => {
			// Keep modifier behaviors (Ctrl toggle / Shift undock) intact.
			// 分岐: 修飾キー時は別操作（Ctrl: autoHide toggle / Shift: undock）なのでここでは処理しない
			if (e.ctrlKey || e.shiftKey) return;
			e.preventDefault();
			e.stopPropagation();
			const bandContent = this._dockGetBandContent(band);
			if (!bandContent) return;
			const side = band?.dataset?.side;
			if (band.classList.contains("autoHide") && !band.classList.contains("expanded")) {
				// autoHide collapsed は一旦展開してからスクロール
				this._dockAutoHideCancelClose(band);
				this._dockSetBandExpanded(band, true);
			}
			requestAnimationFrame(() => {
				// 外部コール: scrollTo（side により縦/横を切り替え）
				if (side === "top" || side === "bottom") {
					bandContent.scrollTo({ left: 0, behavior: "smooth" });
				} else {
					bandContent.scrollTo({ top: 0, behavior: "smooth" });
				}
			});
		});
	};

	_dockBindToggleAutoHideFromTab = (band) => {
		// Ctrl+タブで autoHide の切替をバインド
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweAutoHideToggleBound) return;
		tab.__sweAutoHideToggleBound = true;
		tab.addEventListener("pointerdown", (e) => {
			// 分岐: Ctrl 以外は無視
			if (!e.ctrlKey) return;
			e.preventDefault();
			e.stopPropagation();
			const cur = band?.dataset?.autoHide ?? "inherit";
			// 状態反転（inherit はここでは扱わず true/false をトグル）
			band.dataset.autoHide = (cur === "true") ? "false" : "true";
			// 外部コール: autoHide 適用
			this._applyDockAutoHide(band);
		});
	};

	_dockBindAutoHideClick = (band) => {
		// autoHide をクリックで展開/収納（trigger=click 用）
		const tab = this._dockGetTab(band);
		if (!tab || tab.__sweClickBound) return;
		tab.__sweClickBound = true;
		tab.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// 外部コール: 展開状態を反転
			this._dockSetBandExpanded(band, !band.classList.contains("expanded"));
		});
	};

	/*--------------------------------------------------
		Dock: autoHide の展開/収納
	--------------------------------------------------*/
	_dockSetBandExpanded = (band, expanded) => {
		// autoHide 帯の展開/収納状態を切り替える
		// - autoHide=false: expanded クラスの付け替えのみ
		// - autoHide=true : inline サイズ復元/保存 + animating クラス + inset 更新 + フォールバックタイマー
		if (!band) return;
		// autoHide 以外は単純に expanded クラスだけで制御
		const isAutoHide = band.classList.contains("autoHide");
		if (!isAutoHide) {
			// 分岐: 通常帯（autoHide ではない）
			band.classList.toggle("expanded", !!expanded);
			// 外部コール: inset 更新
			this._dockUpdateOverlayInsets();
			return;
		}

		// タイマーが残っている場合はクリア（多重遷移を避ける）
		this._clearTimeoutField(band, "__sweAutoHideInsetTimer");
		this._clearTimeoutField(band, "__sweAutoHideCollapseFallbackTimer");

		if (expanded) {
			// 分岐: 展開
			// 直前の展開状態の inline サイズを復元（折りたたみ時にクリアしているため）
			const saved = band.__sweAutoHideExpandedStyle;
			if (saved) {
				// 初期化: saved があれば inline サイズを戻す
				if (saved.flex != null) band.style.flex = saved.flex;
				if (saved.flexBasis != null) band.style.flexBasis = saved.flexBasis;
				if (saved.width != null) band.style.width = saved.width;
				if (saved.height != null) band.style.height = saved.height;
			}
			// Keep the band itself under floatLayer; only the tab needs to be above.
			// 外部コール: tab だけ最前面を維持
			this._dockAutoHideEnsureTabOnTop(band);
			// 状態: アニメ中 + 展開
			band.classList.add("sweDockAnimating");
			band.classList.add("expanded");
			// レイアウト確定後に inset を更新
			// 外部コール: inset 更新（rAF 付き）
			this._dockAutoHideRequestInsetUpdate();
			// 遷移が終わった頃に animating を外す
			band.__sweAutoHideInsetTimer = setTimeout(() => {
				band.__sweAutoHideInsetTimer = null;
				// 後処理: アニメ状態解除
				band.classList.remove("sweDockAnimating");
				// 外部コール: inset 更新
				this._dockUpdateOverlayInsets();
			}, 320);
		} else {
			// 分岐: 収納
			// Save last expanded inline sizing and clear it so collapsed CSS (tab-size) can take effect.
			// 初期化: 現在の inline サイズを保存（収納後に復元するため）
			band.__sweAutoHideExpandedStyle = {
				flex: band.style.flex,
				flexBasis: band.style.flexBasis,
				width: band.style.width,
				height: band.style.height,
			};
			// side により width/height のどちらを遷移させるか決める
			const side = band?.dataset?.side;
			const isRow = side === "left" || side === "right";
			// 現在サイズを固定してから、タブサイズへアニメーションさせる
			const curSize = isRow ? (band.offsetWidth || 0) : (band.offsetHeight || 0);
			// CSS変数からタブサイズを取得
			// 外部コール: getComputedStyle
			const tabSizeRaw = getComputedStyle(band).getPropertyValue("--dock-tab-size");
			const tabSize = Number.parseFloat(tabSizeRaw) || 20;
			let cleanedUp = false;
			const cleanupAnim = () => {
				// 後処理: 収納アニメが終わった時のクリーンアップ
				if (cleanedUp) return;
				cleanedUp = true;
				// 外部コール: listener解除
				band.removeEventListener("transitionend", onEnd);
				band.classList.remove("sweDockCollapsing");
				band.classList.remove("sweDockAnimating");
				// Switch to collapsed state ONLY after the collapse animation finishes.
				band.classList.remove("expanded");
				band.classList.remove("sweDockFrontBand");
				// The tab must be above floatLayer when collapsed.
				// 外部コール: tab 最前面維持
				this._dockAutoHideEnsureTabOnTop(band);
				// 初期化: inline サイズをクリアして collapsed CSS に任せる
				if (isRow) band.style.width = "";
				else band.style.height = "";
				// 外部コール: inset 更新
				this._dockUpdateOverlayInsets();
				// When collapsing an autoHide band, make sure the tab is visible.
				band.classList.add("sweDockShowTab");
				this._dockAutoHideEnsureTabOnTop(band);
				// 外部コール: setTimeout（短時間タブを見せる）
				setTimeout(() => band.classList.remove("sweDockShowTab"), 280);
			};
			const onEnd = (e) => {
				// 外部イベント: transitionend
				if (!e) return;
				if (isRow && e.propertyName !== "width") return;
				if (!isRow && e.propertyName !== "height") return;
				cleanupAnim();
			};
			// 初期化: 遷移対象以外の inline をリセット
			band.style.flex = "";
			band.style.flexBasis = "";
			band.classList.add("sweDockCollapsing");
			band.classList.add("sweDockAnimating");
			this._dockAutoHideEnsureTabOnTop(band);
			// Ensure collapse doesn't keep front-band styling/z-index.
			band.classList.remove("sweDockFrontBand");
			// Keep 'expanded' during the animation to avoid showing collapsed arrow too early.
			// Fix current size as an explicit pixel value so width/height transition can run.
			// 初期化: 現在サイズを固定（px）
			if (isRow) band.style.width = curSize + "px";
			else band.style.height = curSize + "px";
			// Force reflow so the next size change transitions.
			void band.offsetWidth;
			// 外部コール: transitionend 監視
			band.addEventListener("transitionend", onEnd);
			// Trigger transition to collapsed tab size.
			requestAnimationFrame(() => {
				// 外部コール: requestAnimationFrame（次フレームでサイズ変更）
				if (isRow) band.style.width = tabSize + "px";
				else band.style.height = tabSize + "px";
				// In case transition doesn't fire (browser edge case), ensure cleanup.
				// 外部コール: setTimeout（フォールバック）
				band.__sweAutoHideCollapseFallbackTimer = setTimeout(() => {
					band.__sweAutoHideCollapseFallbackTimer = null;
					cleanupAnim();
				}, 420);
			});
		}
	};

	_dockAutoHideCloseDelayMs = () => {
		// autoHide を閉じる遅延（hover解除後の猶予）
		return this.scInst?.config?.dock?.autoHideCloseDelayMs ?? 180;
	};

	_dockAutoHideCancelClose = (band) => {
		// 予約済み close をキャンセル
		if (!band) return;
		this._clearTimeoutField(band, "__sweAutoHideCloseTimer");
	};

	_dockAutoHideIsCloseBlocked = (band) => {
		// close を許可しない条件（リサイズ中/一時ロック中/強制展開中）
		if (!band) return false;
		// 分岐: リサイズ中は閉じない
		if (band.__sweResizing) return true;
		// 初期化: 現在時刻
		const now = Date.now();
		// 分岐: ロック期間中は閉じない
		if (band.__sweAutoHideLockUntil && now < band.__sweAutoHideLockUntil) return true;
		// 分岐: 強制展開期間中は閉じない
		if (band.__sweForceExpandedUntil && now < band.__sweForceExpandedUntil) return true;
		return false;
	};

	_dockAutoHideScheduleClose = (band) => {
		// autoHide の close を予約
		if (!band) return;
		// 分岐: autoHide 以外は対象外
		if (!band.classList.contains("autoHide")) return;
		// 分岐: close ブロック中は予約しない
		if (this._dockAutoHideIsCloseBlocked(band)) return;
		// 外部コール: 既存タイマーのキャンセル
		this._dockAutoHideCancelClose(band);
		// 初期化: close delay
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		// 外部コール: setTimeout（close予約）
		band.__sweAutoHideCloseTimer = setTimeout(() => {
			band.__sweAutoHideCloseTimer = null;
			if (!band.classList.contains("autoHide")) return;
			if (this._dockAutoHideIsCloseBlocked(band)) return;
			// 外部コール: 収納
			this._dockSetBandExpanded(band, false);
		}, closeDelayMs);
	};

	_dockAutoHideScheduleCloseAfterUnblock = (band) => {
		// ブロック解除後に close を予約（リサイズ直後など）
		if (!band) return;
		if (!band.classList.contains("autoHide")) return;
		// 外部コール: 既存タイマーのキャンセル
		this._dockAutoHideCancelClose(band);
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		const now = Date.now();
		// 初期化: ブロック解除時刻を解決
		const lockUntil = Number(band.__sweAutoHideLockUntil || 0);
		const forceUntil = Number(band.__sweForceExpandedUntil || 0);
		const unblockAt = Math.max(now, lockUntil, forceUntil);
		const waitMs = Math.max(0, unblockAt - now) + closeDelayMs;
		// 外部コール: setTimeout（解除後に close）
		band.__sweAutoHideCloseTimer = setTimeout(() => {
			band.__sweAutoHideCloseTimer = null;
			if (!band.classList.contains("autoHide")) return;
			if (this._dockAutoHideIsCloseBlocked(band)) return;
			this._dockSetBandExpanded(band, false);
		}, waitMs);
	};

	_dockBindAutoHideHover = (band) => {
		// hover トリガで autoHide を開閉
		if (band.__sweHoverBound) return;
		const tab = this._dockGetTab(band);
		if (!tab) return;
		band.__sweHoverBound = true;
		tab.addEventListener("pointerenter", () => {
			// 外部イベント: tab hover で展開
			if (!band.classList.contains("autoHide")) return;
			this._dockAutoHideCancelClose(band);
			this._dockSetBandExpanded(band, true);
		});

		// Close only when leaving the whole band to avoid flicker while moving from tab to content.
		band.addEventListener("pointerenter", () => {
			// 外部イベント: band 全体に入ったら close を止める
			this._dockAutoHideCancelClose(band);
		});
		band.addEventListener("pointerleave", () => {
			// 外部イベント: band 全体から出たら close を予約
			if (!band.classList.contains("autoHide")) return;
			this._dockAutoHideScheduleClose(band);
		});
	};

	/*--------------------------------------------------
		Dock: inner desktop（overlayRoot / floatLayer）を構築
	--------------------------------------------------*/
	ensureInnerDesktop = () => {
		// Dock/Overlay 用の inner desktop（innerRoot/overlayRoot/floatLayer）を必要時に構築する
		// - 既存コンテンツは floatLayer へ移し、帯（band）と同じレイヤ設計にする
		// - overlayRoot は帯/floatLayer の親（absolute overlay）
		// 既に構築済み、または対象ノードがない場合は何もしない
		if (!this.wdNode || this.innerRoot) return;

		// 設定値（autoHide デフォルト/トリガ）を確定
		// 初期化: config から dock 設定を解決
		this._dockAutoHideDefault = !!(this.scInst?.config?.dock?.autoHide ?? false);
		this._dockAutoHideTrigger = (this.scInst?.config?.dock?.trigger ?? "hover");

		// inner desktop 有効化（CSS側のレイアウト切替用クラス）
		// 外部コール: DOM class 操作
		this.wdNode.classList.add("sweHasInnerDesktop");

		// 既存コンテンツを floatLayer に移す（dock帯の absolute overlay と同じ土俵にする）
		// ※innerRoot は absolute なので、既存の子要素が wdNode 直下に残ると「帯の下」に見える
		const existingContentNodes = Array.from(this.wdNode.childNodes);

		// innerRoot: ウィンドウ内部の absolute ルート（dock/float の土台）
		// 初期化: innerRoot を新規作成
		const innerRoot = document.createElement("div");
		innerRoot.classList.add("sweInnerRoot");

		// overlayRoot: dock帯と floatLayer を並べるルート
		// 初期化: overlayRoot を新規作成
		const overlayRoot = document.createElement("div");
		overlayRoot.classList.add("sweDockOverlayRoot");

		// floatLayer: 子ウィンドウを保持するレイヤ
		// 初期化: floatLayer を新規作成
		const floatLayer = document.createElement("div");
		floatLayer.classList.add("sweFloatLayer");
		// 既存の子要素を floatLayer 配下へ移設
		// 外部コール: DOM append（移設）
		floatLayer.append(...existingContentNodes);

		// DOMへ反映
		// 外部コール: DOM append（構造を確定）
		overlayRoot.append(floatLayer);
		innerRoot.append(overlayRoot);
		this.wdNode.append(innerRoot);

		// 参照を保持（他メソッドから再利用）
		// 初期化: フィールドへ保持
		this.innerRoot = innerRoot;
		this.overlayRoot = overlayRoot;
		this.floatLayer = floatLayer;
		this._dockNode = overlayRoot;
	};

	_dockGetOverlayRoot = () => {
		// overlay root を取得（存在しない場合は innerRoot へフォールバック）
		return this.overlayRoot || this.innerRoot;
	};

	/*--------------------------------------------------
		Dock: band の前面化（z-index）とタブ表示制御
	--------------------------------------------------*/
	_dockBindOverlayBandZBump = (band, direction) => {
		// overlay mode: band の前面化（z-index）と tab 表示（sweDockShowTab）の制御をバインド
		// - band は floatLayer より前に出ないようにクランプ
		// - tab は常に最前面（別z-index）
		// - autoHide/collapsed の場合は CSS 優先で inline z-index を残さない
		// 二重バインド防止
		if (!band || band.__sweOverlayZBound) return;
		band.__sweOverlayZBound = true;
		// pointerleave で tab を消すための遅延タイマー
		let leaveTimer = null;
		// autoHide collapsed 状態か（collapsedはCSS優先で inline z-index を残さない）
		const isCollapsedAutoHide = () => band.classList.contains("autoHide") && !band.classList.contains("expanded");
		// タブの z-index は常に最前面
		const getTabZ = () => this._dockGetDockTabZIndex();
		// floatLayer の z-index
		const floatLayerZ = () => this._dockGetOverlayFloatLayerZIndex();
		// band は floatLayer より前に出ないようにクランプ
		const clampBandZ = (z) => {
			const maxZ = floatLayerZ() - 1;
			return Math.min(Number(z) || 0, maxZ);
		};

		// band の z-index を更新（必要に応じて front band を切替）
		const bumpZ = () => {
			// 分岐: collapsed autoHide は CSS に任せて inline z-index を消す
			// Collapsed autoHide should follow CSS z-index rules (and must not keep stale inline z-index).
			if (isCollapsedAutoHide()) {
				// CSSに任せる（inline z-index を消す）
				this._dockClearBandAndTabZIndex(band);
				return;
			}
			// autoHide expanded tabs can appear via CSS :hover without sweDockShowTab.
			// Never allow autoHide bands to be assigned a low inline z-index that falls under floatLayer.
			if (band.classList.contains("autoHide")) {
				// 分岐: autoHide は band を上げず、tab だけ最前面
				// band は上げない。tab だけ最前面にする。
				this._dockSetBandZIndex(band, null);
				this._dockSetTabZIndex(band, getTabZ());
				return;
			}
			// When the tab is intended to be visible, force the band above floatLayer.
			if (band.classList.contains("sweDockShowTab")) {
				// 分岐: tab 表示意図がある状態でも band は上げず、tab のみ最前面
				// tab可視時も band は上げず、tab のみ前面
				this._dockSetBandZIndex(band, null);
				this._dockSetTabZIndex(band, getTabZ());
				return;
			}
			// overlayRoot を取得し、front band の入れ替えを行う
			const root = this._dockGetOverlayRoot?.();
			if (!root) return;
			// Keep the last interacted band above other bands using z-index (avoid DOM reorder).
			// floatLayer stays above all bands via CSS z-index.
			// 既存 front band を解除
			// ループ: 他の front band を解除
			for (const b of root.querySelectorAll(":scope > .sweDockBand.sweDockFrontBand")) {
				if (b !== band) b.classList.remove("sweDockFrontBand");
			}
			// この band を front にする
			band.classList.add("sweDockFrontBand");
			// band の z-index をインクリメントしつつ、floatLayer未満に収める
			const base = this._dockGetOverlayDockBandZIndex();
			// 初期化: overlayRoot 単位の z カウンタ
			root.__sweOverlayZCounter = (root.__sweOverlayZCounter || base) + 1;
			const zN = Math.min(root.__sweOverlayZCounter, this._dockOverlayBandZMax);
			// 外部コール: inline z-index 設定
			this._dockSetBandZIndex(band, clampBandZ(zN));
			// tab は常に最前面
			this._dockSetTabZIndex(band, getTabZ());
		};

		// tab を一時的に可視にする（hover/クリック時）
		const showTab = () => {
			// 分岐: collapsed autoHide は対象外
			if (isCollapsedAutoHide()) return;
			bumpZ();
			// 初期化: leaveTimer をキャンセルして、表示維持
			if (leaveTimer) {
				clearTimeout(leaveTimer);
				leaveTimer = null;
			}
			band.classList.add("sweDockShowTab");
		};

		// 外部イベント: side によりタブ表示のトリガを変える
		if (direction === "top" || direction === "bottom") {
			// top/bottom は hover で表示
			band.addEventListener("pointerenter", showTab);
		} else {
			// left/right は hover で前面化、click で tab 表示
			band.addEventListener("pointerenter", bumpZ);
			band.addEventListener("click", showTab);
		}

		// 外部イベント: 離脱後に少し遅らせてタブ表示を解除
		band.addEventListener("pointerleave", () => {
			if (leaveTimer) clearTimeout(leaveTimer);
			// 外部コール: setTimeout（ちらつき防止の遅延）
			leaveTimer = setTimeout(() => {
				leaveTimer = null;
				band.classList.remove("sweDockShowTab");
			}, 120);
		});
	};

	_dockUpdateOverlayInsets = () => {
		// overlay の inset（帯の占有領域）を CSS 変数へ反映し、floatLayer の inset を更新する
		// - autoHide collapsed は 0 扱い
		const overlay = this._dockGetOverlayRoot();
		if (!overlay) return;
		const getInset = (side) => {
			// side ごとの占有サイズを計算
			const band = overlay.querySelector?.(`:scope > .sweDockBand[data-side="${side}"]`) ?? null;
			if (!band) return 0;
			if (band.classList.contains("autoHide") && !band.classList.contains("expanded")) return 0;
			if (side === "left" || side === "right") return band.offsetWidth || 0;
			return band.offsetHeight || 0;
		};
		// 外部コール: style.setProperty（CSS変数）
		overlay.style.setProperty(this._dockInsetVarTop, getInset("top") + "px");
		overlay.style.setProperty(this._dockInsetVarRight, getInset("right") + "px");
		overlay.style.setProperty(this._dockInsetVarBottom, getInset("bottom") + "px");
		overlay.style.setProperty(this._dockInsetVarLeft, getInset("left") + "px");
	};

	_setFramePosInHostFromViewportRect = (host, viewportRect) => {
		// host の座標系に合わせて frame の left/top を設定（viewportRect→host内座標へ変換）
		// 外部コール: getBoundingClientRect
		const hr = host.getBoundingClientRect();
		// 初期化: 相対座標へ変換
		const left = viewportRect.left - hr.left;
		const top = viewportRect.top - hr.top;
		// 外部コール: style 更新
		this.frNode.style.left = left + "px";
		this.frNode.style.top = top + "px";
		// 外部コール: rect の同期
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
		// frame を host 配下へ「瞬間移動」させ、viewportRect を元に位置を復元する
		// - drag/dock/undock の基盤
		// - 必要なら元 band の空チェックや Z の再整列も行う
		if (!host || !this.frNode || !viewportRect) return;
		// 状態: teleporting（CSS/見た目用）
		this.frNode.classList.add("teleporting");
		// 外部コール: DOM 移動
		this.frNode.remove();
		host.append(this.frNode);
		// 外部コール: afterTeleport フック
		if (typeof afterTeleport === "function") {
			afterTeleport();
		}
		// 外部コール: 位置の復元 + host 内へ収める
		this._setFramePosInHostFromViewportRect(host, viewportRect);
		this._clampFrameIntoHost(host, bottomInset);
		if (cleanupOriginDock) {
			// 分岐: 元の band が空なら掃除
			originParent?._cleanupEmptyDockFrom?.(originBandContent);
		}
		if (reorderZ) {
			// 分岐: Z の再整列
			this.scInst?.reorderZ?.(this, false);
		}
		// 外部コール: 次フレームで teleporting を解除
		requestAnimationFrame(() => {
			this.frNode.classList.remove("teleporting");
		});
	};

	_clampFrameIntoHost = (host, bottomInset = 0) => {
		// frame が host の範囲外に出ないように left/top をクランプする
		// - bottomInset はタスクバー等で下側に余白が必要な場合
		if (!host || !this.frNode) return;
		// 初期化: frame サイズ
		const w = this.frNode.offsetWidth || this.rect?.width || 0;
		const h = this.frNode.offsetHeight || this.rect?.height || 0;
		// 初期化: 最大移動量
		const maxLeft = Math.max(0, host.clientWidth - w);
		const maxTop = Math.max(0, host.clientHeight - bottomInset - h);

		// 初期化: まず inline style を優先して読む（無ければ offset を使う）
		let left = Number(this.frNode.style.left?.replace(/px$/, ""));
		let top = Number(this.frNode.style.top?.replace(/px$/, ""));
		if (!Number.isFinite(left)) left = this.frNode.offsetLeft;
		if (!Number.isFinite(top)) top = this.frNode.offsetTop;

		left = Math.min(Math.max(0, left), maxLeft);
		top = Math.min(Math.max(0, top), maxTop);

		// 外部コール: style 更新
		this.frNode.style.left = left + "px";
		this.frNode.style.top = top + "px";
		// 外部コール: rect の同期
		this.setCurrentrect?.();
	};

	_isDocked = () => {
		// frame が dock band 配下にあるか（帯化状態）
		return !!this.frNode?.closest?.(".sweDockBand");
	};

	_findParentWindowFromPoint = (x, y) => {
		// 座標上の親ウィンドウ候補を探索（drop/attach のターゲット用）
		// - docked を優先（ネスト時の狙い通りの親にしやすい）
		// 外部コール: elementsFromPoint
		const els = document.elementsFromPoint(x, y);
		let firstNonDocked = null;
		// ループ: ポインタ下の要素を上から順に探索
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
		// 座標上の dock bandContent を探索（drop/stack 判定用）
		// 外部コール: elementsFromPoint
		const els = document.elementsFromPoint(x, y);
		// ループ: ポインタ下の要素を上から順に探索
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
		// bandContent 内で、座標上の docked frame を探索（stack の挿入位置決定用）
		// 外部コール: elementsFromPoint
		if (!bandContent) return null;
		const els = document.elementsFromPoint(x, y);
		// ループ: ポインタ下の要素を上から順に探索
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
		// bandContent 内の docked frame に対して「stack 状態」を反映
		// - 2個目以降を sweChildInDockBand として扱う（見た目/ヘッダー位置など）
		if (!bandContent) return;
		// 初期化: docked frames 一覧
		const frames = Array.from(bandContent.querySelectorAll(":scope > .sweWindowFrame.docked"));
		// ループ: stack 状態の付け替え
		frames.forEach((fr, i) => {
			fr.classList.toggle("sweChildInDockBand", i > 0);
			fr.style.display = "";
			const inst = fr.sweWindow;
			if (inst?.wdNode) {
				// 初期化: docked 中は本文 top を 0 に寄せる
				inst.wdNode.style.top = "0px";
				inst.wdNode.style.height = "";
			}
		});
	};

	_detectDockDirection = (host, x, y) => {
		// ドロップ位置が host の「端」に近いかを判定して、dock 方向（left/right/top/bottom）を返す
		// - 左右を優先（細い帯で上下より先に吸い込まれるのを防ぐ意図）
		// 外部コール: getBoundingClientRect
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
		// ウィンドウを親ウィンドウの floatLayer へ移動して子として扱う（ネスト）
		// 外部コール: teleport（viewportRect 基準で移動）
		if (!parentWin || parentWin === this) return;
		// 外部コール: 親の inner desktop を確保
		parentWin.ensureInnerDesktop?.();
		if (!parentWin.floatLayer) return;

		const originParent = this.parentWin;
		const originBandContent = this.frNode?.closest?.(".sweDockBandContent");

		const vr = this.frNode.getBoundingClientRect();
		const parentInDockContext = !!(
			parentWin.frNode?.classList?.contains("docked") ||
			parentWin.frNode?.classList?.contains("sweChildInDockBand")
		);
		// 外部コール: teleport
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
						// 外部コール: insertBefore（先頭に積む）
						parentWin.floatLayer.insertBefore(this.frNode, firstChildFrame);
					}
				}
				// 外部コール: 親参照/クラス付け替え
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
		// 親から外して画面（screen）へ戻す
		// - 現在の viewportRect を元に scNode へ teleport
		// - 元 band が空なら掃除
		// - Z は reorderZ で整列
		if (!this.scInst?.scNode) return;
		// 初期化: 元の親/元 band を控える
		const originParent = this.parentWin;
		const originBandContent = this.frNode?.closest?.(".sweDockBandContent");
		// 外部コール: getBoundingClientRect
		const vr = this.frNode.getBoundingClientRect();
		// 外部コール: teleport
		this._teleportFrameToHostFromViewportRect({
			host: this.scInst.scNode,
			viewportRect: vr,
			bottomInset: this.tbNode?.offsetHeight ?? 0,
			originParent,
			originBandContent,
			cleanupOriginDock: true,
			reorderZ: true,
			afterTeleport: () => {
				// 外部コール: 親参照/クラス付け替え
				this._setChildParentAndDockBandClass(this, null);
			},
		});
	};

	_ensureDockSplit = (direction) => {
		// overlay mode: 指定 side の dock band を確保して { band, bandContent } を返す
		// - 既存があればそれを再利用
		// - 無ければ band を生成し、divider リサイズと autoHide をバインド
		this.ensureInnerDesktop();
		// 外部コール: overlayRoot 取得
		const overlay = this._dockGetOverlayRoot();
		if (!overlay) return {};

		// Overlay mode: one band per side, absolutely positioned over the main content.
		// 初期化: 既存 band を探索
		let band = overlay.querySelector?.(`:scope > .sweDockBand[data-side="${direction}"]`) ?? null;
		let bandContent = band ? this._dockGetBandContent(band) : null;
		if (band && bandContent) {
			// 分岐: 既存 band を再利用
			this._dockNode = overlay;
			// 外部コール: band の前面化/タブ制御をバインド
			this._dockBindOverlayBandZBump(band, direction);
			// 外部コール: inset 更新
			this._dockUpdateOverlayInsets();
			return { band, bandContent };
		}

		// 分岐: band が無いので新規生成
		// 外部コール: band 一式生成
		const created = this._dockCreateSplitNodes(direction);
		band = created.band;
		bandContent = created.bandContent;
		const divider = created.divider;
		if (!band || !bandContent) return {};

		// Default size for the band (can be resized by divider)
		// 初期化: 初期サイズ（後で divider で変更される）
		const defaultW = 260;
		const defaultH = 200;
		if (direction === "left" || direction === "right") {
			band.style.width = band.style.width || defaultW + "px";
		} else {
			band.style.height = band.style.height || defaultH + "px";
		}

		// 外部コール: DOM へ mount
		overlay.append(band);
		// 外部コール: band z-bump / tab 表示制御
		this._dockBindOverlayBandZBump(band, direction);
		this._dockNode = overlay;
		// 外部コール: divider によるリサイズをバインド
		this._attachDockDividerResize(divider, null, band, bandContent, direction);
		// 外部コール: autoHide の適用/バインド
		this._applyDockAutoHide(band);
		// 外部コール: inset 更新
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
		// divider をドラッグして band のサイズ（width/height）を変更する
		// - pointerdown/move/up を window キャプチャで処理
		// - autoHide の場合はリサイズ中に展開を維持し、リサイズ後の close を調整
		let dragging = false;
		let start = 0;
		let startSize = 0;
		// 初期化: side により軸（row/column）を決定
		const isRow = this._dockIsRowSide(side);
		// 初期化: config から min/max を解決
		const bandMin = this.scInst?.config?.dock?.bandMin ?? 120;
		const bandMax = this.scInst?.config?.dock?.bandMax ?? 600;
		const mainMin = this.scInst?.config?.dock?.mainMin ?? 200;
		// 初期化: autoHide close delay
		const closeDelayMs = this._dockAutoHideCloseDelayMs();
		let dividerSize = 4;
		let activePointerId = null;
		let lastClientX = null;
		let lastClientY = null;

		// bandContent は残りを埋める
		// 初期化: flex を調整して bandContent が残りを占有
		if (bandContent) {
			bandContent.style.flex = "1 1 auto";
			bandContent.style.flexBasis = "auto";
			bandContent.style.width = "";
			bandContent.style.height = "";
		}

		divider.addEventListener("pointerdown", (e) => {
			// 外部イベント: pointerdown（リサイズ開始）
			e.preventDefault();
			e.stopPropagation();
			dragging = true;
			band.__sweResizing = true;
			band.classList.add("sweDockResizing");
			band.classList.add("sweDockAutoHideResizing");
			// 初期化: 最後の pointer 位置を保持
			lastClientX = e.clientX;
			lastClientY = e.clientY;
			// 外部コール: autoHide close を止める
			this._dockAutoHideCancelClose(band);
			if (band.classList.contains("autoHide")) {
				// 分岐: autoHide はリサイズ中に展開を維持
				this._dockSetBandExpanded(band, true);
			}
			// 初期化: pointer capture
			activePointerId = e.pointerId;
			divider.setPointerCapture(e.pointerId);
			// 初期化: divider の実サイズと開始位置/サイズ
			dividerSize = isRow ? (divider.offsetWidth || 4) : (divider.offsetHeight || 4);
			start = isRow ? e.clientX : e.clientY;
			startSize = isRow ? band.offsetWidth : band.offsetHeight;
			// 外部コール: window へ move/up をバインド（キャプチャ）
			window.addEventListener("pointermove", onMove, true);
			window.addEventListener("pointerup", onUp, true);
			window.addEventListener("pointercancel", onUp, true);
		});

		const onMove = (e) => {
			// 外部イベント: pointermove（リサイズ中）
			if (!dragging) return;
			if (activePointerId !== null && e.pointerId != null && e.pointerId !== activePointerId) return;
			e.preventDefault();
			// 初期化: 最後の pointer 位置
			lastClientX = e.clientX;
			lastClientY = e.clientY;
			// 初期化: 差分と次サイズを計算
			const d = (isRow ? e.clientX : e.clientY) - start;
			let next = startSize;
			// 分岐: right/bottom は反転
			if (side === "right" || side === "bottom") next = startSize - d;
			else next = startSize + d;

			// 外部コール: overlay サイズを参照して mainMin を確保
			const overlay = this._dockGetOverlayRoot();
			const containerSize = isRow ? (overlay?.clientWidth ?? 0) : (overlay?.clientHeight ?? 0);
			const maxByMain = Math.max(bandMin, containerSize - mainMin);
			const cappedMax = Math.min(bandMax, maxByMain);
			next = Math.max(bandMin, Math.min(cappedMax, next));

			if (isRow) {
				// 外部コール: inline サイズ更新
				band.style.width = next + "px";
			} else {
				// 外部コール: inline サイズ更新
				band.style.height = next + "px";
			}
			// 外部コール: inset 更新
			this._dockUpdateOverlayInsets();
		};

		const onUp = (e) => {
			// 外部イベント: pointerup/cancel（リサイズ終了）
			if (!dragging) return;
			if (activePointerId !== null && e.pointerId != null && e.pointerId !== activePointerId) return;
			// 初期化: 状態解除
			dragging = false;
			activePointerId = null;
			band.__sweResizing = false;
			band.classList.remove("sweDockResizing");
			// 初期化: リサイズ中フラグ解除（遅延）
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
			// 初期化: リサイズ直後は close を抑制（境界が動いて hover 状態が変わるのを吸収）
			band.__sweAutoHideLockUntil = Date.now() + Math.max(240, closeDelayMs);
			// 外部コール: close をキャンセル
			this._dockAutoHideCancelClose(band);
			if (band.classList.contains("autoHide")) {
				// 分岐: autoHide は一定時間強制展開
				band.__sweForceExpandedUntil = Date.now() + 900;
				this._dockSetBandExpanded(band, true);
				// 初期化: pointer の最終位置から band 内外を判定
				const x = Number.isFinite(e?.clientX) ? e.clientX : lastClientX;
				const y = Number.isFinite(e?.clientY) ? e.clientY : lastClientY;
				// 外部コール: getBoundingClientRect
				const br = band.getBoundingClientRect();
				const inside = Number.isFinite(x) && Number.isFinite(y)
					? (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom)
					: false;
				if (!inside) {
					// 分岐: 既に外へ出ているなら、解除後に close を予約
					this._dockAutoHideScheduleCloseAfterUnblock(band);
				}
			}
			// 後処理: 変数リセット
			lastClientX = null;
			lastClientY = null;
			// 外部コール: pointer capture 解放
			try { divider.releasePointerCapture(e.pointerId); } catch { }
			// 外部コール: window listener 解除
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("pointerup", onUp, true);
			window.removeEventListener("pointercancel", onUp, true);
			// 外部コール: inset 更新
			this._dockUpdateOverlayInsets();
		};

		divider.addEventListener("lostpointercapture", onUp);
	};

	dockChild = (childWin, side, insertAfterFrame = null) => {
		// 子ウィンドウを指定 side の帯へ dock（帯化）する
		// - 必要なら親へ attach してから bandContent へ reparent
		// - 直前の float サイズを保存し、band の向きに応じて width/height を調整
		if (!childWin || childWin === this) return;
		// 外部コール: inner desktop を確保
		this.ensureInnerDesktop();
		// childWin の inner desktop は、childWin 自身が子を持つ時だけ必要。
		// ここで生成すると content のスクロールが潰れるため遅延させる。

		const originParent = childWin.parentWin;
		const originBandContent = childWin.frNode?.closest?.(".sweDockBandContent");

		if (childWin.parentWin !== this) {
			// 分岐: 親が違う場合は先に attach
			childWin.attachToParent(this);
		}

		// 外部コール: band/bandContent を確保
		const { bandContent } = this._ensureDockSplit(side);

		// Save the floating size before docking overwrites it with sizing.
		// 初期化: undock 時に復元するため、浮動時の rect を保存
		childWin._dockLastFloatRect = { ...(childWin.rect ?? {}) };
		// 外部コール: dock 用に frame の状態をリセット
		this._dockResetFrameForDock(childWin);
		// Prevent transition artifacts (from absolute top/left) that can look like overlaps.
		// 初期化: transition を一時無効化
		const prevTransition = childWin.frNode.style.transition;
		childWin.frNode.style.transition = "none";
		// Insert directly under the overlapped docked block (drop target). If none, append.
		// 初期化: 可能なら drop 位置の直後へ挿入
		const insertBefore = (insertAfterFrame && insertAfterFrame.parentElement === bandContent)
			? insertAfterFrame.nextSibling
			: null;
		// 外部コール: DOM 移動
		this._reparentFrameToHost(childWin, bandContent, insertBefore);
		// 外部コール: docked 時の inline layout を適用
		this._dockApplyDockedInlineLayout(childWin);
		// 初期化: band の向きでサイズの扱いを分岐
		const isHorizontalBand = side === "top" || side === "bottom";
		if (isHorizontalBand) {
			// top/bottom: 横に並べるため幅は float を保持し、高さを揃える
			const rawW = childWin._dockLastFloatRect?.width ?? childWin.rect?.width;
			const w = Number.parseFloat(rawW) || childWin.frNode.offsetWidth || 360;
			childWin.frNode.style.width = w + "px";
			childWin.frNode.style.height = "100%";
		} else {
			// left/right: 縦に積むため幅は 100%、高さ（minHeight）を float を基準に確保
			const rawH = childWin._dockLastFloatRect?.height ?? childWin.rect?.height;
			const h = Number.parseFloat(rawH) || childWin.frNode.offsetHeight || 260;
			childWin.frNode.style.width = "100%";
			childWin.frNode.style.height = "";
			childWin.frNode.style.minHeight = h + "px";
		}
		childWin.frNode.style.flex = "0 0 auto";
		// 外部コール: 次フレームで transition を戻す
		requestAnimationFrame(() => {
			childWin.frNode.style.transition = prevTransition;
		});
		// 外部コール: rect 更新
		childWin.setCurrentrect?.();
		// 状態: docked
		childWin.frNode.classList.add("docked");
		childWin.frNode.classList.remove("sweChildInDockBand");
		if (childWin.wdNode) {
			// 初期化: docked 中は本文 top を 0 に寄せる
			childWin.wdNode.style.top = "0px";
			childWin.wdNode.style.height = "";
		}
		// 外部コール: tab 表示を更新
		const band = bandContent.closest(".sweDockBand");
		this._dockRefreshTabIfNeeded(band);
		// 外部コール: stacked separators 更新
		this._dockRefreshStackSeparators(bandContent);
		// 外部コール: undock / autoHide のバインド・適用
		this._dockBindUndockFromTab(band);
		this._applyDockAutoHide(band);
		// 外部コール: 元 band の空チェック
		this._dockCleanupEmptyOriginBand(originParent, originBandContent);
		// 外部コール: 前面化
		childWin.bringToFront?.();
	};

	undockToFloat = (childWin) => {
		// 子ウィンドウを帯から外して floatLayer へ戻す（浮動化）
		// - 現在の viewportRect を元に teleport
		// - 保存済みの float rect があればサイズを復元
		if (!childWin || childWin.parentWin !== this) return;
		// 外部コール: inner desktop を確保
		this.ensureInnerDesktop();
		// 外部コール: getBoundingClientRect
		const vr = childWin.frNode.getBoundingClientRect();
		const fromBandContent = childWin.frNode.closest?.(".sweDockBandContent");
		const fromBand = fromBandContent?.closest?.(".sweDockBand") ?? null;
		const wasActive = childWin.frNode.classList.contains("sweDockActive");
		// 状態: docked クラス解除
		childWin.frNode.classList.remove("docked");
		childWin.frNode.classList.remove("sweDockActive");
		if (childWin.wdNode && childWin.hdNode) {
			// 初期化: 通常レイアウトへ戻す（ヘッダー分 top を戻す）
			childWin.wdNode.style.top = childWin.hdNode.offsetHeight + "px";
		}
		// 外部コール: docked inline layout をクリア
		this._dockClearDockedInlineLayout(childWin);
		// 外部コール: teleport（bandContent→floatLayer）
		childWin._teleportFrameToHostFromViewportRect({
			host: this.floatLayer,
			viewportRect: vr,
			bottomInset: 0,
			originParent: this,
			originBandContent: fromBandContent,
			cleanupOriginDock: true,
			afterTeleport: () => {
				// 外部コール: 親参照/クラス付け替え
				this._setChildParentAndDockBandClass(childWin, this);
				// 外部コール: タブ更新
				this._dockRefreshTabIfNeeded(fromBand);
				// Restore the floating size if available.
				const r = childWin._dockLastFloatRect;
				if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) {
					// 初期化: float 時のサイズを復元
					childWin.frNode.style.width = r.width + "px";
					childWin.frNode.style.height = r.height + "px";
				}
			},
		});
	};

	_handleDropAfterMove = (e) => {
		// ドラッグ終了時のドロップ処理
		// - modifier 無し: band 上なら stack / それ以外は attach
		// - Ctrl/Shift: 端なら dock、端以外なら undock（既に帯の中なら）
		// - Ctrl: 親の外へ落としたら detach（画面へ戻す）
		if (!e) return;
		const x = e.clientX;
		const y = e.clientY;
		const ctrl = !!e.ctrlKey;
		const shift = !!e.shiftKey;
		// Dock/Undock のモディファイア
		// UI説明と互換: Ctrl を優先（Shift でも可）
		const dockMode = ctrl || shift;

		// No modifiers: if dropped onto a dock band, stack into that band.
		if (!ctrl && !shift) {
			// 分岐: 修飾キーなし
			// 外部コール: bandContent ヒットテスト
			const hitBand = this._findDockBandContentFromPoint(x, y);
			if (hitBand) {
				// 分岐: band 上なら同 band に stack
				const hostFrame = hitBand.bandContent.closest?.(".sweWindowFrame");
				const hostWin = hostFrame?.sweWindow;
				const side = hitBand.band?.dataset?.side;
				// 外部コール: band 内の drop target（docked frame）探索
				const targetFrame = this._findDockedFrameInBandFromPoint(hitBand.bandContent, x, y);
				if (hostWin && side) {
					// 外部コール: dockChild（stack）
					hostWin.dockChild(this, side, targetFrame);
				}
				return;
			}
			// 分岐: band 以外は parent へ attach
			// 外部コール: 親探索
			const parent = this._findParentWindowFromPoint(x, y);
			if (parent) {
				// 外部コール: attach
				this.attachToParent(parent);
			}
			return;
		}

		// Ctrl: 親の外へ落としたら detach
		if (ctrl && this.parentWin) {
			// 分岐: Ctrl は親外ドロップで画面へ戻す
			const host = this.parentWin.floatLayer || this.parentWin.wdNode;
			if (host) {
				// 外部コール: getBoundingClientRect
				const pr = host.getBoundingClientRect();
				const inside = x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
				if (!inside) {
					// 外部コール: detach
					this.detachToScreen();
					return;
				}
			}
		}

		// If dropped onto a docked window, stack into the same dock band.
		// 外部コール: bandContent ヒットテスト
		const hitBand = this._findDockBandContentFromPoint(x, y);
		if (hitBand) {
			// 分岐: modifier 有りでも band 上なら stack を優先
			const hostFrame = hitBand.bandContent.closest?.(".sweWindowFrame");
			const hostWin = hostFrame?.sweWindow;
			const side = hitBand.band?.dataset?.side;
			const targetFrame = this._findDockedFrameInBandFromPoint(hitBand.bandContent, x, y);
			if (hostWin && side) {
				hostWin.dockChild(this, side, targetFrame);
			}
			return;
		}

		// 外部コール: 親探索
		const parent = this._findParentWindowFromPoint(x, y);
		if (parent) {
			// 端判定は「見た目の縁（フレーム外周）」を基準にする。
			// wdNode はヘッダーや padding の内側になるため、縁に落としても端判定が取れないことがある。
			// floatLayer は dock inset によって内側へ縮むため、端判定に不向き。
			// 初期化: 判定基準の host を決定
			const host = parent.frNode || parent.wdNode || parent.floatLayer;

			// Ctrl/Shift: 端なら帯化（dock）。必要なら親へ attach してから dock。
			if (dockMode) {
				// 外部コール: 端判定
				const side = parent._detectDockDirection(host, x, y);
				if (side) {
					// 外部コール: dock
					parent.dockChild(this, side);
					return;
				}
				// 端以外に落とした場合は（帯→子）へ戻す
				if (this.parentWin && this._isDocked()) {
					// 分岐: dockMode で端以外なら undock
					this.parentWin.undockToFloat(this);
					return;
				}
			}

			// Ctrl: 親へ入れる（attach）
			if (ctrl) {
				// 外部コール: attach
				this.attachToParent(parent);
				return;
			}
			return;
		}

		// Ctrl/Shift: dock 解除（帯→子）
		if (this.parentWin && dockMode && this._isDocked()) {
			// 端判定はフレーム外周基準（wdNode/floatLayer 基準だとズレることがある）
			// 初期化: 親側 host を決定
			const host = this.parentWin.frNode || this.parentWin.wdNode || this.parentWin.floatLayer;
			// 外部コール: 端判定
			const side = this.parentWin._detectDockDirection(host, x, y);
			if (!side) {
				// 分岐: 端でなければ undock
				this.parentWin.undockToFloat(this);
			}
		}
	};


	/*--------------------------------------------------
		コンストラクタ
	--------------------------------------------------*/
	constructor(input, scInst, frZ) {
		// 初期化: 参照（DOM/Screen）を保持
		this.wdNode = input;
		this.scInst = scInst;
		this.frZ = frZ;
		this.scNode = this.scInst.scNode;
		// 外部コール: taskbar を取得
		this.tbNode = this.scNode.querySelector(".sweTaskbar");

	}


	/*--------------------------------------------------
		初期化
	--------------------------------------------------*/
	async init(config) {
		// ウィンドウを初期化し、frame/header/taskbar/event 等を組み立てる
		// 外部コール: attachFrame/addHeader/add2taskbar/setInitialSize/setInitialPos/removeWdAttr/attachEvents/addResizeParts
		const jsonString = JSON.stringify(config, (key, value) => {
			if (value === config) {
				return undefined; // 自分自身を参照している場合はundefinedを返す
			}
			return value;
		});

		// コンフィグ展開
		// 外部コール: parseConfig
		this.parseConfig(config);

		// フレームで囲む
		// 外部コール: attachFrame
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
		// wdNode を frNode（外枠）で包んで screen に配置する
		// - openAnim を開始する場合は animationend で解除
		// - コンテンツ（url/html/text）を解決して中身を反映
		// - window-type / window-id / z-index を設定
		// 外部コール: document.createElement/append/setAttribute/fetch/getComputedStyle/requestAnimationFrame
		this.frNode = document.createElement("div");
		this.frNode.classList.add("sweWindowFrame");

		//		this.wdNode.parentNode.insertBefore(this.frNode, this.wdNode);
		this.frNode.append(this.wdNode);
		this.scNode.append(this.frNode);

		// 分岐: 起動アニメーション
		if (this.startAnimation) {
			if (this?.startAnimation) {
				// 外部コール: rAF
				requestAnimationFrame(() => {
					this.frNode.classList.add("openAnim");
				});
			}
			// 外部イベント: animationend
			this.frNode.addEventListener("animationend", (e) => {
				if (e.target !== this.frNode) return;
				this.frNode.classList.remove("openAnim");
			}, { once: true });
		}

		// 分岐: URLコンテンツ
		if (this.content.kind === "url") {
			// 外部コール: fetch
			await this.getURLcontent();
		} else if (this.content.kind === "html") {
			this.wdNode.innerHTML = String(this.content.value ?? "");
		} else if (this.content.kind === "text") {
			this.wdNode.textContent = String(this.content.value ?? "");
		}

		// 分岐: Type を設定する
		if (this.type) {
			this.frNode.setAttribute("window-type", this.type);
		}

		// window-id を付加
		this.frNode.setAttribute("window-id", this.winid);
		this.wdNode.removeAttribute("window-id");
		this.wdNode.classList.add("sweWindow");

		// 外部コール: Z-index の設定
		this.setZindex();

	};



	async startOpenAnimation() {
		// openAnim を明示的に再生する
		// - animationend を待つ（transition と干渉しないよう min/max 中は抑止）
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
		// init 用の config をインスタンスフィールドへ展開
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
		// frame の z-index を設定する（screen の reorderZ からも呼ばれる）
		this.frZ = !z ? this.frZ : z;
		this.frNode.style.zIndex = String(this.frZ);

	};



	/*--------------------------------------------------
		URLでコンテンツを持ってくる
	--------------------------------------------------*/
	getURLcontent = async () => {
		// URL から HTML を取得して wdNode に流し込む
		// 外部コール: fetch/response.text
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
		// ヘッダー（タイトル/操作ボタン）を生成して frame に追加
		// 外部コール: document.createElement/prepend
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
		// 初期サイズを rect に基づいて確定し、frame/wd の幅高さを整える
		// - wdNode は padding を含めたサイズに調整
		// - frNode はヘッダー分を加味して外枠サイズを決める
		// 外部コール: getComputedStyle/offsetHeight/offsetWidth
		const styles = window.getComputedStyle(this.wdNode);

		// 分岐: 高さ
		if (this.rect.height) {
			const height = +this.rect.height;
			this.wdNode.style.height = height + (+styles.paddingTop.replace(/px/, '') + +styles.paddingBottom.replace(/px/, '')) + "px";
		} else {
			this.wdNode.style.height = this.frNode.style.height;
		}
		// 外部コール: frame 高さを反映（本文+ヘッダー）
		this.frNode.style.height = +this.wdNode.offsetHeight + +this.hdNode.offsetHeight + "px";

		// 分岐: 幅
		if (this.rect.width) {
			this.wdNode.style.width = this.rect.width + (+styles.paddingLeft.replace(/px/, '') + +styles.paddingRight.replace(/px/, '')) + "px";
		} else {
			this.wdNode.style.width = "100%";
		}
		// 外部コール: frame 幅を反映（左右枠の分 +2px）
		this.frNode.style.width = this.wdNode.offsetWidth + 2 + "px";

	}



	/*--------------------------------------------------
		位置を揃える
	--------------------------------------------------*/
	setInitialPos = () => {
		// 初期位置を rect に基づいて確定し、frame の top/left を設定
		// - top/left 未指定なら現在の DOM 位置から採用
		// 外部コール: getBoundingClientRect
		const wdRect = this.wdNode.getBoundingClientRect();

		// 分岐: top（未指定なら現在位置から）
		if (!this.rect.top) {
			this.rect.top = wdRect.top + "px";
		}
		// 外部コール: style 更新
		this.frNode.style.top = this.rect.top + "px";

		// 分岐: left（未指定なら現在位置から）
		if (!this.rect.left) {
			this.rect.left = wdRect.left + "px";
		}
		// 外部コール: style 更新
		this.frNode.style.left = this.rect.left + "px";


		// 外部コール: rect を同期
		this.setCurrentrect();
		// 外部コール: wdNode の宣言スタイルを解除
		this.dropWdNodeStypes();

	}



	/*--------------------------------------------------
		内部ウィンドウの規定サイズやポジションを削除する
	--------------------------------------------------*/
	dropWdNodeStypes = () => {
		// wdNode の位置/サイズ指定を解除（以後は frame 側が位置/サイズを管理）
		// 外部コール: style 更新
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
		// frame の inline style（top/left/width/height）から rect を再構築する
		// - drag/resize 等で style が更新された後に呼ばれる
		if (!this.frNode.style.height || !this.frNode.style.width || !this.frNode.style.top || !this.frNode.style.left) return;
		//		console.log(`this.frNode.style.height`, +this.frNode.style.height.replace(/px/, ''));
		// 初期化: ウィンドウのサイズ
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
		// frame の inline 位置/サイズを消す → CSS（maximize/minimize など）を効かせる
		// 外部コール: style 更新
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
		// 保存済み rect を元に、frame の inline 位置/サイズを復元する
		// 外部コール: style 更新
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
		// 初期化に使った宣言属性を削除（以後は JS 管理）
		// 外部コール: removeAttribute
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
		// ヘッダータイトルを生成して追加
		// 外部コール: document.createElement
		const headerTitle = document.createElement("div");
		headerTitle.classList.add("sweWindowHeaderTitle");
		headerTitle.textContent = this.title ?? "no-title";

		this.hdNode.append(headerTitle);

	}



	/*--------------------------------------------------
		コントロールボタンの追加
	--------------------------------------------------*/
	attachControlButtons = () => {
		// ヘッダー右側の操作ボタン（min/max/close）を生成して追加
		// - 実際のイベントバインドは attachEvents 側で行われる想定
		// 外部コール: document.createElement/append
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
		// タスクバーへウィンドウボタンを追加する
		// 外部コール: querySelector/document.createElement/append
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
			// 外部コール: 前面化
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
		// 主要イベントをまとめてバインドする
		// - 前面化（focus）
		// - 移動（drag）
		// - min/max/close
		// - ヘッダー操作（dblclick）
		// - タスクバー操作
		// 外部コール: 各イベントバインド関数

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
		// ヘッダーボタン（min/max/close）にイベントをバインド
		// 外部イベント: pointerdown
		this.hdNode.querySelector(".minimize").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// 外部コール: 最小化
			this.resizeWindow("minimize");
		});

		this.hdNode.querySelector(".maximize").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// 外部コール: 最大化/通常へトグル
			this.resizeWindow("maximize");
		});

		this.hdNode.querySelector(".close").addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// 外部コール: close
			this.closeWindow();
		});

	};



	/*--------------------------------------------------
		外部からのコントロール
	--------------------------------------------------*/
	ctrlWin = (action = null) => {
		// 外部（screen/taskbar等）からの操作を受けて、この window を制御
		//console.log("ctrlWin", action);
		if (!action || !["focus", "maximize", "minimize", "close"].includes(action)) return;

		// 分岐: focus は前面化、他は resizeWindow に委譲
		if (action === "focus") { this.bringToFront(); }
		else {
			this.resizeWindow(action);
		}

	};



	/*--------------------------------------------------
		ヘッダーダブルクリックに maximize button を押した時の挙動
	--------------------------------------------------*/
	headerDoubleClick = () => {
		// ヘッダーのダブルクリックで maximize をトグル
		// 外部イベント: dblclick
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
		// タスクバーボタンのクリックで minimize/restore/focus を切り替える
		// - active 状態なら minimize
		// - 非active なら bringToFront
		// 外部イベント: pointerdown
		let resizeFrom;
		let resizeTo;

		this.twNode.addEventListener("pointerdown", (e) => {
			//			console.log(e);
			e.preventDefault();
			e.stopPropagation();

			// 分岐: すでに minimize なら restore
			if (this.frNode.classList.contains("minimize")) {
				resizeFrom = "minimize";
				resizeTo = this.lastStat === "maximize" ? "maximize" : "normal";
			}
			else {
				// 分岐: minimize でない場合は focus/minimize のトグル
				if (this.onFocus) {
					this.onFocus.call(this, this);
					//console.log("this.onFocus", this.onFocus);
				}
				if (this.frNode.classList.contains("maximize")) {
					if (this.frNode.classList.contains("active")) {
						// maximize かつ active → minimize
						resizeFrom = "maximize";
						resizeTo = "minimize";
					}
					else {
						// maximize だが非active → 前面化だけ
						this.bringToFront();
						return;
					}
				}
				else {
					if (this.frNode.classList.contains("active")) {
						// normal かつ active → minimize
						resizeFrom = "normal";
						resizeTo = "minimize";
					}
					else {
						// normal だが非active → 前面化だけ
						this.bringToFront();
						return;
					}
				}
			}

			// 初期化: 遷移メソッド名を組み立てて呼び出す（例: normal2minimize）
			const resizeMethod = resizeFrom + "2" + resizeTo;
			// 外部コール: 動的ディスパッチ
			this[resizeMethod]();

		});

	};



	/*--------------------------------------------------
		windowを前面に出す
	--------------------------------------------------*/
	activateWindowEvent = () => {
		// frame の pointerdown で前面化（focus）する
		// 外部イベント: pointerdown
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
		// ウィンドウをアクティブ化して最前面にする
		// - docked child の場合は親も前面化（親チェーンをアクティブ化）
		// - active クラスを付け替え、taskbar 側も同期
		// 外部コール: scInst.reorderZ
		// dock された子がアクティブになったら親チェーンもアクティブ化する
		// （attach しただけでは親をアクティブ化しない）
		if (this.parentWin && this.frNode?.classList?.contains("docked")) {
			this.parentWin.bringToFront?.();
		}
		// ループ: 既存 active を解除
		this.frNode.parentNode.querySelectorAll(".sweWindowFrame.active").forEach((swf) => {
			if (swf !== this.frNode) {
				swf.classList.remove("active");
				const twNode = swf.closest(".sweWindowFrame").querySelector(".sweWindow").sweWindow.twNode;
				twNode.classList.remove("active");
			}
		});
		// 外部コール: class 更新
		this.frNode.classList.add("active");
		this.twNode.classList.add("active");
		// 外部コール: Z の再整列（最前面化）
		this.scInst.reorderZ(this, false);

	};


	/*--------------------------------------------------
		Maximize / Minimize
	--------------------------------------------------*/
	resizeWindow = async (resizeTo) => {
		// 最大化/最小化/通常/close を統一的に呼び分ける
		// - 現在状態（maximize/minimize）から resizeFrom を決め、"from2to" を呼ぶ
		// 外部コール: closeWindow / 各遷移メソッド
		let resizeFrom;
		//console.log("resizeWindow", resizeTo);

		// 分岐: close は専用
		if (resizeTo === "close") {
			await this.closeWindow();
			return;
		}
		else if (this.frNode.classList.contains("maximize")) {
			// 分岐: maximize 中
			if (resizeTo === "maximize") { resizeTo = "normal"; }
			resizeFrom = "maximize";
		}
		else if (this.frNode.classList.contains("minimize")) {
			// 分岐: minimize 中
			if (resizeTo === "minimize") { resizeTo = this.lastStat ? this.lastStat : "normal"; }
			resizeFrom = "minimize";
		}
		else {
			// 分岐: normal
			resizeFrom = "normal";
		}

		const resizeMethod = resizeFrom + "2" + resizeTo;

		// 外部コール: 動的ディスパッチ
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
		// 本文領域（wdNode）の高さを frame から再計算して CSS 変数へ反映
		// - minimize/maximize アニメ中はレイアウト変更を避ける
		// 外部コール: clientHeight / style.setProperty
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
		// normal → minimize のアニメ遷移
		// - タスクバーのボタン中心へ吸い込む量（dx/dy）を CSS 変数へ設定
		// - animationend で minimize 状態へ
		// 外部コール: getBoundingClientRect/style.setProperty/addEventListener
		this.bringToFront();

		if (!this.twNode) return;

		this.lastStat = "normal";
		const brect = this.twNode.getBoundingClientRect();

		const dx = (brect.left + brect.width / 2) - (this.rect.left + this.rect.width / 2);
		const dy = (brect.top + brect.height / 2) - (this.rect.top + this.rect.height / 2);

		this.frNode.style.setProperty("--min-dx", dx + "px");
		this.frNode.style.setProperty("--min-dy", dy + "px");

		this.frNode.classList.add("minimizeAnim");

		// 外部イベント: animationend
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
		// normal → maximize のアニメ遷移
		// - 現在の rect を from-* として CSS 変数へ設定
		// - taskbar 高さも CSS 変数へ渡して、最大化領域を決める
		// 外部コール: style.setProperty/addEventListener/removeStyle
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
		// minimize → normal のアニメ遷移
		// - タスクバーボタン中心から元の rect へ戻るように見せる
		// - animationend で minimize/restoreAnim を解除し、前面化する
		// 外部コール: getBoundingClientRect/style.setProperty/addEventListener/bringbackStyle

		if (!this.twNode || !this.rect) return;

		this.frNode.style.display = "flex";

		this.lastStat = "minimize";
		const brect = this.twNode.getBoundingClientRect();

		this.frNode.style.transform = "none";
		this.frNode.style.opacity = "0";

		// 外部コール: 位置/サイズを復元
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
		// maximize → minimize のアニメ遷移
		// - maximize 状態でもタスクバー中心へ吸い込むように minimize する
		// - animationend で minimize 状態にして display:none
		// 外部コール: getBoundingClientRect/style.setProperty/addEventListener/bringToFront

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

		// 外部イベント: animationend
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
		// maximize → normal の復帰
		// - maximize の見た目を一度 px 固定し、normal の rect（bringbackStyle）へ遷移させる
		// - transitionend で後始末（maximize解除/高さ再計算）
		// 外部コール: getBoundingClientRect/requestAnimationFrame/addEventListener/bringbackStyle/adjust_wdNode_height

		if (!this.twNode || !this.rect) return;

		// 最大化中でも前面に
		this.bringToFront();

		this.frNode.style.display = "flex";
		this.lastStat = "maximize";

		// maximize状態の見た目を一旦 px で固定（現在値を確定）
		// 外部コール: getBoundingClientRect
		const r = this.frNode.getBoundingClientRect();
		this.frNode.style.top = r.top + "px";
		this.frNode.style.left = r.left + "px";
		this.frNode.style.width = r.width + "px";
		this.frNode.style.height = r.height + "px";

		// 次フレームで normal に戻す（差分が必ず出る）
		// 外部コール: rAF
		requestAnimationFrame(() => {
			this.bringbackStyle();
		});

		// ★漏れてたやつ：ここで復元（top/left/width/height が変わる）
		this.bringbackStyle();

		const onEnd = (e) => {
			// transitionend: width/height/top/left のいずれかが完了したら後始末
			if (e.target !== this.frNode) return;
			if (!["width", "height", "top", "left"].includes(e.propertyName)) return;

			// ここから後始末
			this.frNode.style.transform = "";
			this.frNode.style.opacity = "";
			this.frNode.classList.remove("maximize");
			this.frNode.style.removeProperty("--min-dx");
			this.frNode.style.removeProperty("--min-dy");

			// 外部コール: 本文高さを再計算
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
		// minimize → maximize の復帰
		// - 先に最大化状態の矩形をセットし、タスクバー中心から飛び出す restoreAnim を再生
		// - animationend で minimize/restoreAnim を解除し、最大化として確定
		// 外部コール: getBoundingClientRect/style.setProperty/addEventListener/bringToFront

		if (!this.twNode) return;

		// 最大化中でも前面に
		this.bringToFront();

		this.lastStat = "minimize";
		this.frNode.style.display = "flex";

		// 念のため transform / opacity を初期化
		this.frNode.style.transform = "none";
		this.frNode.style.opacity = "0";

		// 2) 「最大化状態」の矩形にしておく（最終的な位置・サイズ）
		// 外部コール: getBoundingClientRect
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

		// 外部イベント: animationend
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
		// ウィンドウを閉じる
		// - closing クラスで見た目を切り替え
		// - rAF で transform/opacity を変更して transition を開始
		// - transitionend（+保険タイマー）で DOM を削除し resolve
		// 外部コール: requestAnimationFrame/addEventListener/remove
		return new Promise((resolve) => {

			this.frNode.classList.add("closing");

			// 外部コール: rAF
			requestAnimationFrame(() => {
				this.frNode.style.transform = "scale(0.7)";
				this.frNode.style.opacity = "0";
			});

			const onEnd = () => {
				// transition 完了後の後始末
				this.frNode.removeEventListener("transitionend", onEnd);

				this.frNode.remove();
				this.twNode?.remove();

				if (this.onClose) { this.onClose(this); }

				resolve();
			};

			// 外部イベント: transitionend（transition がある前提）
			this.frNode.addEventListener("transitionend", onEnd);

			// ★保険（transitionend 来ない環境用）
			setTimeout(onEnd, 250);
		});
	};





	/*--------------------------------------------------
		ウィンドウリサイズアニメーション
	--------------------------------------------------*/
	windowResizeAnimation = async (point, size, outMin = false) => {
		// 旧来の「10分割」手動アニメ（setInterval）で rect を補間する
		// - outMin=true の場合は最小化状態から復帰する時の DOM 位置を調整
		// 外部コール: setInterval/clearInterval/style 更新

		return new Promise((resolve) => {

			// 初期化: アニメーションカウンタ
			let cnt = 1;
			let timer = setInterval(() => {
				// 外部コール: style 更新（top/left/width/height）
				this.frNode.style.top = point.start.top + (point.unit.top * cnt) + "px";
				this.frNode.style.left = point.start.left + (point.unit.left * cnt) + "px";
				this.frNode.style.height = size.start.height + (size.unit.height * cnt) + "px";
				this.frNode.style.width = size.start.width + (size.unit.width * cnt) + "px";
				if (outMin) {
					// 分岐: minimize からの復帰時はタスクバーの直前へ戻す
					this.tbNode.parentNode.insertBefore(this.frNode, this.tbNode);
					outMin = false;
				}
				cnt++;
				if (cnt == 11) {
					// 外部コール: タイマー停止
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
		// ヘッダーのドラッグでウィンドウを移動する（GPU加速のため transform を使用）
		// - pointerdown→pointermove で dx/dy を更新し、rAF で描画
		// - pointerup で top/left を確定し transform を解除
		// - Ctrl/Shift を併用すると detach/undock など構造操作も行う
		// 外部コール: setPointerCapture/getBoundingClientRect/requestAnimationFrame
		let dragging = false;
		let armed = false;
		let startLeft = 0, startTop = 0;
		let mousePos = { x: 0, y: 0 };
		let activePointerId = null;
		let currentDX = 0, currentDY = 0;
		let lastPointerEvent = null;

		const isBlocked = () =>
			// maximize/minimize 中は drag を禁止
			this.frNode.classList.contains("maximize") ||
			this.frNode.classList.contains("minimize");

		const requestDraw = () => {
			// ドラッグ中のみ requestAnimationFrame で描画
			if (!dragging) return;
			// 外部コール: rAF
			requestAnimationFrame(() => {
				if (!dragging) return;
				// 外部コール: transform で追従
				this.frNode.style.transform = `translate(${currentDX}px, ${currentDY}px)`;
			});
		};

		const resetDragBaselineAfterTeleport = (e, hostNode = null) => {
			// detach/undock 等で DOM を移動した直後に、drag の基準（startLeft/Top と mousePos）を取り直す
			// - teleport 前に計算した dx/dy をそのまま使うとズレるため
			this.frNode.style.transform = "";
			mousePos = { x: e.clientX, y: e.clientY };
			// 外部コール: getBoundingClientRect
			const fr = this.frNode.getBoundingClientRect();
			const hr = hostNode?.getBoundingClientRect?.();
			if (hr) {
				// 分岐: host 基準座標に合わせる
				startLeft = fr.left - hr.left;
				startTop = fr.top - hr.top;
			} else {
				// 分岐: offsetLeft/Top 基準
				startLeft = this.frNode.offsetLeft;
				startTop = this.frNode.offsetTop;
			}
			currentDX = 0;
			currentDY = 0;
			activePointerId = e.pointerId;
			// 外部コール: pointer capture
			try { this.hdNode.setPointerCapture(e.pointerId); } catch { }
		};

		this.hdNode.addEventListener("pointerdown", (e) => {
			// drag 開始（armed）: クリック直後は遊びを入れ、少し動いたら dragging へ遷移
			if (e.button !== 0 || isBlocked()) return;
			if (e.target.closest(".sweWindowHeaderButtons")) return;
			// dock 中は通常操作を禁止（構造操作の Ctrl 系のみ許可）
			if (this.frNode.classList.contains("docked") && !(e.ctrlKey || e.shiftKey)) return;

			armed = true;
			dragging = false;
			activePointerId = e.pointerId;
			// 外部コール: pointer capture
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
			// drag 中の追従
			if (!armed && !dragging) return;
			if (e.pointerId !== activePointerId) return;
			lastPointerEvent = e;

			const dx = e.clientX - mousePos.x;
			const dy = e.clientY - mousePos.y;

			if (armed && !dragging) {
				// 遊び（遊びがないとクリックだけで少し動いてしまう）
				if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
				// 状態: dragging に遷移
				dragging = true;
				armed = false;
				// Ctrl-drag on an attached child window: detach immediately so it becomes an external
				// window from the start of the drag (avoids waiting until the cursor exits the parent).
				if (e.ctrlKey && this.parentWin && !this._isDocked()) {
					// 分岐: Ctrl+drag で即 detach
					this.detachToScreen();
					resetDragBaselineAfterTeleport(e, this.scInst?.scNode);
					// Prevent applying stale dx/dy (computed before teleport) in this same event.
					requestDraw();
					return;
				}
				// Ctrl/Shift drag from a dock band: undock first so the frame can stay above bands
				// and docking hit-tests continue to work.
				if ((e.shiftKey || e.ctrlKey) && this.parentWin && this._isDocked()) {
					// 分岐: Ctrl/Shift+drag で undock→float
					this.parentWin.undockToFloat(this);
					resetDragBaselineAfterTeleport(e, this.parentWin?.floatLayer);
					requestDraw();
					return;
				}
				// When this is an attached child window, its z-index is constrained by the parent frame's
				// stacking context. Bring the parent to front too so the child can drag over dock bands.
				// 外部コール: 親も前面化
				this.parentWin?.bringToFront?.();
				this.frNode.classList.add("dragging");
				// 外部コール: 自身を前面化
				this.bringToFront?.();
			}

			if (dragging) {
				currentDX = dx;
				currentDY = dy;

				// Ctrl ドラッグ中、親の外へ出たら自動 detach（ドラッグ継続）
				if (e.ctrlKey && this.parentWin) {
					const host = this.parentWin.floatLayer || this.parentWin.wdNode;
					if (host) {
						// 外部コール: getBoundingClientRect
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
			// pointerup/cancel/lostcapture: drag を終了して座標を確定
			if (e && activePointerId !== e.pointerId) return;

			// 外部コール: pointer capture 解除
			if (activePointerId !== null) {
				try { this.hdNode.releasePointerCapture(activePointerId); } catch { }
				activePointerId = null;
			}

			if (armed) { armed = false; return; }
			if (!dragging) return;

			dragging = false;
			this.frNode.classList.remove("dragging");

			// --- 座標の確定処理 ---
			// 初期化: 最終的な top/left
			const finalX = startLeft + currentDX;
			const finalY = startTop + currentDY;

			// 初期化: transition による「吸い込み」を防止
			const originalTransition = this.frNode.style.transition;
			this.frNode.style.transition = "none";

			// top/left を更新し transform を消す
			this.frNode.style.left = finalX + "px";
			this.frNode.style.top = finalY + "px";
			this.frNode.style.transform = "";

			// 外部コール: 強制リフロー
			this.frNode.offsetHeight;

			// transition を復元
			this.frNode.style.transition = originalTransition;

			// 外部コール: rect 更新
			this.setCurrentrect?.();
			// 外部コール: ドロップ処理（dock/attach/stack など）
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
		// リサイズ用のハンドル（枠）を追加して、ドラッグで resize できるようにする
		// - 方向ごとに resizer 要素を生成し、pointermove で nextW/nextH 等を更新
		// 外部コール: document.createElement/append/addEventListener
		let attachReizer = (p) => {
			// p: "top"/"bottom"/"left"/"right" などの方向
			const resizer = document.createElement("div");
			resizer.classList.add("sweWindow_resize_" + p);
			this.frNode.append(resizer);

			// 初期化: ドラッグ状態
			let dragging = false;
			let startMouse = { x: 0, y: 0 };
			let startSize = { w: 0, h: 0 };
			let startPos = { x: 0, y: 0 };

			// 初期化: rAF 用（pointermove を毎回 style 反映すると重いのでまとめる）
			let pending = false;
			let nextW = null, nextH = null;
			let nextLeft = null, nextTop = null;

			// addResizeParts 内の applyResize を修正
			const applyResize = () => {
				// pointermove が連続する間は rAF で 1フレームに1回だけ反映
				if (pending) return;
				pending = true;

				// 外部コール: requestAnimationFrame
				requestAnimationFrame(() => {
					// 外部コール: style 更新（null の項目は更新しない）
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
				// 状態: dragging 開始

				dragging = true;

				// 軽量モード ON（選択抑止/描画軽量化）
				this.frNode.classList.add("resizing");
				this.scNode.classList.add("unselectable");

				// 外部コール: pointer capture（外に出ても追跡）
				this.frNode.setPointerCapture(e.pointerId);

				startMouse.x = e.clientX;
				startMouse.y = e.clientY;

				// Always base resize on the current DOM rect to avoid drift when this.rect is stale.
				// 外部コール: getBoundingClientRect
				const fr = this.frNode.getBoundingClientRect();
				const sr = this.scNode.getBoundingClientRect();
				startPos.x = fr.left - sr.left;
				startPos.y = fr.top - sr.top;
				startSize.w = fr.width;
				startSize.h = fr.height;

				// 初期化: 方向文字列（class から抽出）
				let direction = e.target.getAttribute("class")
					.replace(/^.*sweWindow_resize_| .*$/gms, "");
				const dir = direction.toLowerCase();

				const onPointerMove = (e) => {
					// pointermove: dx/dy を元に nextW/nextH/nextLeft/nextTop を計算
					if (!dragging) return;

					if (!this.moveFlag && this.onMoveStart) {
						this.onMoveStart(this);
						this.moveFlag = true;
					}

					// 初期化: 移動量
					const dx = e.clientX - startMouse.x;
					const dy = e.clientY - startMouse.y;

					nextW = nextH = nextLeft = nextTop = null;

					// 分岐: ↑ 上側
					if (dir.includes("top")) {
						nextH = startSize.h - dy;
						nextTop = startPos.y + dy;
					}
					// 分岐: ↓ 下側
					if (dir.includes("bottom")) {
						nextH = startSize.h + dy;
					}
					// 分岐: ← 左側
					if (dir.includes("left")) {
						nextW = startSize.w - dx;
						nextLeft = startPos.x + dx;
					}
					// 分岐: → 右側
					if (dir.includes("right")) {
						nextW = startSize.w + dx;
					}

					// 分岐: 最小サイズを保証
					if (this.minSize) {
						if (nextW != null && this.minSize.width) {
							nextW = nextW < this.minSize.width ? this.minSize.width : nextW;
						}
						if (nextH != null && this.minSize.height) {
							nextH = nextH < this.minSize.height ? this.minSize.height : nextH;
						}
					}

					// 外部コール: rAF で style 反映
					applyResize();
				};

				const onPointerUp = (e) => {
					// pointerup: drag 終了、capture 解除、イベント解除、rect を永続化
					dragging = false;
					// 外部コール: pointer capture 解除
					this.frNode.releasePointerCapture(e.pointerId);

					// 軽量モード OFF
					this.frNode.classList.remove("resizing");
					this.scNode.classList.remove("unselectable");

					// 外部コール: document listener 解除
					document.removeEventListener("pointermove", onPointerMove);
					document.removeEventListener("pointerup", onPointerUp);

					// Persist the final rect so the next resize starts from the correct baseline.
					// 外部コール: rect 更新
					this.setCurrentrect?.();

					// コンテンツの高さ調整
					//					this.adjust_wdNode_height();

					// 分岐: move/resize の終了フック
					if (this.moveFlag && this.onMoveEnd) {
						this.onMoveEnd(this);
						this.moveFlag = false;
					}
				};

				// 外部コール: document に move/up をバインド（capture したフレーム外でも追跡するため）
				document.addEventListener("pointermove", onPointerMove);
				document.addEventListener("pointerup", onPointerUp);
			});
		};

		// 既存のあなたの生成ロジックそのまま
		// - 直辺（top/right/bottom/left）と、角（leftTop 等）を作る
		let pp;
		for (const p of ["top", "right", "bottom", "left"]) {
			pp = pp ?? "left";
			attachReizer(pp + (p.charAt(0).toUpperCase() + p.slice(1)));
			attachReizer(p);
			pp = p;
		}
	};







}
