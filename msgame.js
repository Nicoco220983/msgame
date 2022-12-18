const { assign } = Object
const { abs, floor, ceil, min, max, sqrt, random: rand, cos, sin, atan2, PI } = Math
const { log, assert } = console

// utils

function _getArg(args, key, defVal) {
    let val = args && args[key]
    if (val === undefined) return defVal
    return val
}

const _isArr = Array.isArray

function _asArr(a) {
    if (a === undefined) return []
    return _isArr(a) ? a : [a]
}

function _createEl(name) {
    return document.createElement(name)
}

function _createCan(width, height) {
    const can = _createEl("canvas")
    can.width = width
    can.height = height
    return can
}

function _ctx(can) {
    return can.getContext("2d")
}

function _getCached(obj, key, getter) {
    let cache = obj._cache
    if (!cache) cache = obj._cache = {}
    let val = cache[key]
    if (val === undefined) val = cache[key] = getter()
    return val
}

function _wait(dt) {
    return new Promise((ok, ko) => setTimeout(ok, dt))
}

function _mayCall(a) {
    return (typeof a === "function") ? a() : a
}

export class Pool {
    constructor(nb, gen) {
        this.pool = []
        for (let i = 0; i < nb; ++i)
            this.pool.push(gen())
        this.curIte = 0
    }
    next() {
        const i = this.curIte
        const res = this.pool[i]
        this.curIte = (i + 1) % this.pool.length
        return res
    }
}

export function absPath(relPath){
    const url = new URL(relPath, import.meta.url)
    return url.pathname
}

// elem

class Elem {

    constructor(kwargs) {
        this.time = 0
        if(kwargs) this.set(kwargs)
    }

    set(state) {
        assign(this, state)
    }

    start() {}

    update(dt) {
        if(this.time === 0) this.start()
        this.time += dt
        if(this._timeEvents) this.applyTimeEvents()
    }

    on(evt, callback) {
        if(typeof evt === "string") {
            let evts = this._events
            if (!evts) evts = this._events = {}
            let callbacks = evts[evt]
            if (!callbacks) callbacks = evts[evt] = {}
            if (typeof callback === "function") {
                for (let i = 0; ; ++i) {
                    const key = "_" + i
                    if (callbacks[key] === undefined) {
                        callbacks[key] = callback
                        return
                    }
                }
            } else if(typeof callback === "object") {
                for (let key in callback)
                    callbacks[key] = callback[key]
            }
        } else if(typeof evt === "number") {
            let evts = this._timeEvents
            if (!evts) evts = this._timeEvents = []
            evts.push([evt + this.time, callback])
        }
    }

    once(evt, callback) {
        this.on(evt, () => { callback(); return false })
    }

    off(evt, key) {
        if (evt === undefined) { delete this._events; return }
        let evts = this._events
        if (!evts) return
        if (key === undefined) { delete evts[evt]; return }
        let callbacks = evts[evt]
        if (!callbacks) return
        delete callbacks[key]
    }

    trigger(evt, ...args) {
        let evts = this._events
        if (!evts) return
        let callbacks = evts[evt]
        if (!callbacks) return
        for (let key in callbacks) {
            if (callbacks[key].call(this, ...args) === false)
                delete callbacks[key]
        }
    }

    applyTimeEvents() {
        this._timeEvents = this._timeEvents.filter(([time, callback]) => {
            if(this.time >= time) {
                callback()
                return false
            }
            return true
        })
    }

    remove() {
        if(this.removed) return
        this.removed = true
        this.trigger("remove")
    }

    every(timeKey, period, fun) {
        let lastTimes = this.lastTimes
        if(!lastTimes) lastTimes = this.lastTimes = {}
        const lastTime = lastTimes[timeKey] || 0
        if (this.time >= lastTime) {
            lastTimes[timeKey] = this.time + _mayCall(period)
            fun()
        }
    }
}

// Game

export class Game extends Elem {

    static {
        assign(this.prototype, {
            width: 600,
            height: 400,
            fps: 60,
            dblClickDurarion: .3,
        })
    }

    constructor(parentEl, kwargs) {
        super({
            paused: false,
            ...kwargs
        })
        this.parentEl = parentEl
    }

    // canvas

    get canvas() {
        if(!this._canvas) {
            const wrapEl = this.wrapEl = document.createElement("div")
            assign(wrapEl.style, { position: "relative" })
            const can = this._canvas = document.createElement("canvas")
            assign(can, { width: this.width, height: this.height })
            if(this.autoFit !== false) {
                this.fitCanvas()
                window.addEventListener('resize', () => this.fitCanvas())
            }
            wrapEl.appendChild(can)
            this.parentEl.appendChild(wrapEl)
        }
        return this._canvas
    }

    fitCanvas() {
        const WoH = this.width / this.height
        const elW = this.parentEl.offsetWidth || this.parentEl.innerWidth
        const elH = this.parentEl.offsetHeight || this.parentEl.innerHeight
        const elWoH = elW / elH
        this.canvas.style.width = floor((WoH > elWoH) ? elW : (elH * WoH)) + "px"
        this.canvas.style.height = floor((WoH > elWoH) ? (elW / WoH) : elH) + "px"
    }

    // game loop 

    async initLoop() {
        await waitLoads()
        const timeFrame = 1 / this.fps
        let dt = timeFrame
        while (true) {
            const now = Date.now()
            this.update(dt)
            this.draw(dt)
            const elapsed = (Date.now() - now) / 1000
            const toWait = max(0, timeFrame - elapsed)
            await _wait(toWait * 1000)
            dt = elapsed + toWait
        }
    }

    start() {
        this.initPointer()
        document.addEventListener("focus", () => this.trigger("focus"))
        document.addEventListener("blur", () => this.trigger("blur"))
    }

    draw(dt) {}

    // pointer

    initPointer() {
        this.pointer = new Elem({ isDown: false })
        let lastPointerClickTime = null
        this.addPointerDownListener(pos => {
            this.pointer.x = pos.x
            this.pointer.y = pos.y
            this.pointer.isDown = true
            this.pointer.trigger("down")
            if(lastPointerClickTime && (this.time - lastPointerClickTime) < this.dblClickDurarion) {
                this.trigger("dblclick", this.pointer)
                this.pointer.trigger("dblclick")
                lastPointerClickTime = null
            } else {
                this.trigger("click", this.pointer)
                this.pointer.trigger("click")
                lastPointerClickTime = this.time
            }
        })
        this.addPointerUpListener(() => {
            this.pointer.isDown = false
            this.pointer.trigger("up")
        })
        this.addPointerMoveListener(pos => {
            this.pointer.x = pos.x
            this.pointer.y = pos.y
            this.pointer.trigger("move")
        })
    }

    addPointerDownListener(next) {
        this._addPointerListerner(this.canvas, "mousedown", "touchstart", next)
    }

    addPointerUpListener(next) {
        this._addPointerListerner(document.body, "mouseup", "touchend", next)
    }

    addPointerMoveListener(next) {
        this._addPointerListerner(this.canvas, "mousemove", "touchmove", next)
    }

    _addPointerListerner(el, mousekey, touchkey, next) {
        el.addEventListener(mousekey, evt => {
            next(this._getEvtPos(evt))
        }, false)
        el.addEventListener(touchkey, evt => {
            evt.preventDefault()
            next(this._getEvtPos(evt.changedTouches[0]))
        }, false)
    }

    _getEvtPos(evt) {
        const canvas = this.canvas
        const rect = this.canvas.getBoundingClientRect()
        const strech = canvas.clientWidth / canvas.width
        return {
            x: (evt.clientX - rect.left) / strech,
            y: (evt.clientY - rect.top) / strech
        }
    }

    pause(val) {
        if (val === this.paused) return
        this.paused = val
        pauseAudios(val)
        this.trigger("pause", val)
    }
}

// Scene

export class Scene extends Elem {

    constructor(game, kwargs) {
        super({
            x: 0,
            y: 0,
            viewX: 0,
            viewY: 0,
            width: game.width,
            height: game.height,
            ...kwargs
        })
        this.game = game
        this.sprites = []
    }
    set(state) {
        if(state.removed) this.remove()
        super.set(state)
    }
    get canvas(){
        if(!this._canvas) {
            this._canvas = _createCan(this.width, this.height)
            this.initCanvas()
        }
        return this._canvas
    }
    initCanvas(){
        const color = this.color || "white"
        const ctx = this.canvas.getContext("2d")
        ctx.fillStyle = color
        ctx.fillRect(0, 0, this.width, this.height)
    }
    update(dt) {
        super.update(dt)
        this.sprites.forEach(s => s.update(dt))
        this.sprites = this.sprites.filter(s => !s.removed)
    }
    drawTo(gameCtx, dt=0, viewX=0, viewY=0) {
        this.draw(dt)
        gameCtx.drawImage(this.canvas, ~~(this.x - viewX), ~~(this.y - viewY))
    }
    draw(dt) {
        const viewX = this.viewX, viewY = this.viewY, ctx = this.canvas.getContext("2d")
        this.sprites.forEach(s => s.drawTo(ctx, dt, viewX, viewY))
    }
    addSprite(cls, state){
        const res = new cls(this)
        if(state) res.set(state)
        this.sprites.push(res)
        return res
    }
    remove() {
        super.remove()
        this.sprites.forEach(s => s.remove())
    }
}

// Sprite

export function strechImg(img) {
    const { width, height } = this
    return { width, height }
}

export function fitImg(img) {
    const { width: sw, height: sh } = this
    const { width: iw, height: ih } = img
    const swh = sw / sh, iwh = iw / ih
    const cw = swh < iwh ? sw : iw * sh / ih
    const ch = swh > iwh ? sh : ih * sw / iw
    return { width: cw, height: ch }
}

export function fillImg(img) {
    const { width: sw, height: sh } = this
    const { width: iw, height: ih } = img
    const swh = sw / sh, iwh = iw / ih
    const cw = swh > iwh ? sw : iw * sh / ih
    const ch = swh < iwh ? sh : ih * sw / iw
    return { width: cw, height: ch }
}

export class Sprite extends Elem {

    static {
        assign(this.prototype, {
            z: 0,
            width: 50,
            height: 50,
            anchorX: 0,
            anchorY: 0,
            anim: "black",
            getImgScaleArgs: strechImg,
        })
    }

    constructor(parent, kwargs) {
        super({
            x: 0,
            y: 0,
            angle: 0,
            animTime: 0,
            ...kwargs
        })
        if(parent instanceof Game) {
            this.game = parent
        } else if(parent instanceof Scene) {
            this.scene = parent
            this.game = parent.game
        }
    }

    set(state) {
        if(state.removed) this.remove()
        super.set(state)
    }

    getBoundaries() {
        const { x, y, width, height, anchorX, anchorY } = this
        return {
            x: x - width * anchorX,
            y: y - height * anchorY,
            width, height
        }
    }

    drawTo(scnCtx, dt=0, viewX=0, viewY=0) {
        const img = this.getImg(dt)
        if (!img) return
        const { x, y } = this.getBoundaries()
        const imgX = (this.width - img.width) / 2
        const imgY = (this.height - img.height) / 2
        scnCtx.drawImage(img, ~~(x + imgX - viewX), ~~(y + imgY - viewY))
    }

    getImg(dt) {
        let anim = this.anim
        if (!anim) return
        if (typeof anim == "string") anim = this.getDefaultAnim()
        const img = anim.getImg(this.animTime)
        this.animTime += dt
        if (!img) return
        const transArgs = this.getImgTransArgs(img)
        return anim.transformImg(img, transArgs)
    }

    getImgTransArgs(img) {
        const args = this.getImgScaleArgs(img)
        if (this.angle) args.angle = this.angle
        if (this.animFlipX) args.flipX = true
        if (this.animFlipY) args.flipY = true
        const animAlpha = this.animAlpha
        if (animAlpha !== undefined && animAlpha !== null) args.alpha = this.animAlpha
        if(this.animCompose) args.compose = this.animCompose
        if(this.animCall) args.call = this.animCall
        return args
    }

    getDefaultAnim() {
        return _getCached(this.__proto__, `dImg:${this.anim}`, () => {
            const size = 10
            const can = createCanvasFromStr(size, size, this.anim)
            return new Anim(can)
        })
    }
}

function createCanvasFromStr(width, height, descStr) {
    const can = _createCan(width, height), ctx = _ctx(can)
    const descArgs = descStr.split('_')
    const color = descArgs[0]
    const shape = (descArgs.length >= 2) ? descArgs[1] : "box"
    ctx.fillStyle = color
    if(shape === "box") {
        ctx.fillRect(0, 0, width, height)
    } else if(shape === "circle") {
        ctx.beginPath()
        ctx.arc(width/2, height/2, width/2, 0, 2*PI, false)
        ctx.fill()
    }
    return can
}

// Loads

export const Loads = []

function _waitLoad(load) {
    return new Promise((ok, ko) => {
        const __waitLoad = () => {
            if (load.loaded) return ok()
            if (load.loadError) return ko(load.loadError)
            setTimeout(__waitLoad, 10)
        }
        __waitLoad()
    })
}

export function waitLoads() {
    return Promise.all(Loads.map(_waitLoad))
}

// SpriteSheet

export class SpriteSheet {
    constructor(src, kwargs) {
        this.src = src
        this.frames = []
        assign(this, kwargs)
        this.load()
    }
    async load() {
        if (this.loaded) return
        Loads.push(this)
        const img = this.img = new Img(this.src)
        await _waitLoad(img)
        const frameWidth = this.frameWidth || img.width
        const frameHeight = this.frameHeight || img.height
        const ilen = floor(img.width / frameWidth)
        const jlen = floor(img.height / frameHeight)
        for (let j = 0; j < jlen; ++j) for (let i = 0; i < ilen; ++i) {
            const can = this.getFrame(i + ilen * j)
            can.width = frameWidth
            can.height = frameHeight
            _ctx(can).drawImage(img, ~~(-i * frameWidth), ~~(-j * frameHeight))
        }
        this.loaded = true
    }
    getFrame(num) {
        const frames = this.frames
        while (frames.length <= num) frames.push(_createCan(0, 0))
        return frames[num]
    }
}

// Anim

export class Anim {

    static {
        assign(this.prototype, {
            fps: 1,
            loop: true,
        })
    }

    constructor(imgs, kwargs) {
        this.imgs = _asArr(imgs).map(img => (typeof img === "string") ? new Img(img) : img)
        assign(this, kwargs)
    }
    getImg(time) {
        const imgs = this.imgs
        let numImg = floor(time * this.fps)
        if(this.loop) numImg = numImg % imgs.length
        else if(numImg >= imgs.length) return null
        return imgs[numImg]
    }
    transformImg(img, kwargs) {
        return _getCached(img, JSON.stringify(kwargs), () => {

            let width = kwargs.width || img.width
            let height = kwargs.height || img.height
            const angle = kwargs.angle || 0

            let awidth = width, aheight = height
            if(angle) {
                awidth = abs(cos(angle)) * width + abs(sin(angle)) * height
                aheight = abs(cos(angle)) * height + abs(sin(angle)) * width
            }

            let can = _createCan(awidth, aheight), ctx = _ctx(can)
            can.dx = width - awidth
            can.dy = height - aheight

            const alpha = kwargs.alpha
            if(alpha!==undefined && alpha!==null) ctx.globalAlpha = alpha

            ctx.translate(awidth/2, aheight/2)
            ctx.scale(kwargs.flipX ? -1 : 1, kwargs.flipY ? -1 : 1)
            ctx.rotate(angle)
            ctx.drawImage(img, -width/2, -height/2, width, height)
            ctx.translate(-awidth/2, -aheight/2)

            if(kwargs.call) {
                const cans = [can]
                const ctx = {
                    getCanvas: idx => (isNaN(parseInt(idx)) ? createCanvasFromStr(awidth, aheight, idx) : cans[idx])
                }
                for(let callStr of kwargs.call.split(';')) {
                    const callArgs = callStr.split(',')
                    const callFun = Anim.callers[callArgs.shift()]
                    cans.push(callFun(ctx, ...callArgs))
                }
                can = cans[cans.length-1]
            }
            
            return can
        })
    }
}

Anim.callers = {
    compose: function(ctx, compKey, sourceCan, compCan) {
        sourceCan = ctx.getCanvas(sourceCan)
        compCan = ctx.getCanvas(compCan)
        const sourceCtx = _ctx(sourceCan)
        sourceCtx.globalCompositeOperation = compKey
        sourceCtx.drawImage(compCan, 0, 0, sourceCan.width, sourceCan.height)
        return sourceCan
    }
}

// Img

export class Img extends Image {
    constructor(src, kwargs) {
        super()
        this.src = src
        assign(this, kwargs)
        Loads.push(this)
        this.onload = () => this.loaded = true
        this.onerror = () => this.loadError = `load error: ${src}`
    }
}

// Audio

export const Audios = []

export class Aud extends Audio {

    static MaxVolumeLevel = 1
    static VolumeLevel = 1

    static {
        assign(this.prototype, {
            baseVolume: 1,
        })
    }

    constructor(src, kwargs) {
        super()
        this.src = src
        assign(this, kwargs)
        this.syncVolume()
        this.setLoop(this.loop)
        Audios.push(this)
        Loads.push(this)
        this.onloadeddata = () => this.loaded = true
        this.onerror = () => this.loadError = `load error: ${src}`
    }
    playable() {
        return this.currentTime == 0 || this.ended
    }
    replay(kwargs) {
        if (!_getArg(kwargs, "force") && !this.playable()) return
        this.setLoop(_getArg(kwargs, "loop", false))
        this.currentTime = 0
        assign(this, kwargs)
        this.syncVolume()
        this.play()
    }
    syncVolume() {
        this.volume = this.baseVolume * Aud.VolumeLevel
    }
    setLoop(val) {
        if(val) {
            if(this.loopListerner) return
            this.loopListerner = this.addEventListener('ended', function() {
                this.currentTime = 0;
                this.play();
            }, false)
        } else {
            if(!this.loopListerner) return
            this.removeEventListener(this.loopListerner)
            delete this.loopListerner
        }
    }
    remove() {
        this.pause()
        const idx = Audios.indexOf(this)
        if(idx !== -1) Audios.splice(idx, 1)
    }
}

export function pauseAudios(val) {
    Audios.forEach(a => {
        if (val) {
            if (a.currentTime == 0 || a.ended) return
            a.pause()
            a.pausedByGame = true
        } else {
            if (!a.pausedByGame) return
            a.play()
            a.pausedByGame = false
        }
    })
}

export function setVolumeLevel(val) {
    Aud.VolumeLevel = val
    Audios.forEach(a => a.syncVolume())
}

export class AudPool extends Pool {
    constructor(nb, src, kwargs) {
        super(nb, () => new Aud(src, kwargs))
    }
}

// math

export function sign(a) {
    if (a === 0) return 0
    return (a > 0) ? 1 : -1
}

export function bound(a, min, max) {
    if (a < min) return min
    if (a > max) return max
    return a
}

export function randge(from, to) {
    return from + rand() * (to - from)
}

export function range(a, b) {
    if (b === undefined) { b = a; a = 0 }
    const res = []
    for (let i = a; i < b; ++i) res.push(i)
    return res
}

// dynamics

export function spdToPos2d(obj, tgt, spd, dt) {
    const _spd = spd * dt
    const distX = obj.x - tgt.x, distY = obj.y - tgt.y
    const dist = sqrt(distX * distX + distY * distY)
    if (dist < _spd) {
        obj.x = tgt.x
        obj.y = tgt.y
        return true
    } else {
        const angle = atan2(distY, distX)
        obj.x -= _spd * cos(angle)
        obj.y -= _spd * sin(angle)
        return false
    }
}

export function accToSpd(spd, tgtSpd, acc, dec, dt) {
    if (spd == tgtSpd) return spd
    const a = (spd == 0 || spd * tgtSpd > 0) ? (acc * dt) : (dec * dt)
    if (tgtSpd > 0 || (tgtSpd == 0 && spd < 0)) {
        return min(spd + a, tgtSpd)
    } else if (tgtSpd < 0 || (tgtSpd == 0 && spd > 0)) {
        return max(spd - a, tgtSpd)
    }
}

export function accToPos(pos, tgt, spd, spdMax, acc, dec, dt) {
    const dist = tgt - pos, adist = abs(dist), sdist = sign(dist)
    const tgtSpd = bound(sdist * sqrt(adist * dec), -spdMax, spdMax)
    return accToSpd(spd, tgtSpd, acc, dec, dt)
}

// collision

export function collide(s1, s2) {
    if (s1.getBoundaries) s1 = s1.getBoundaries()
    if (s2.getBoundaries) s2 = s2.getBoundaries()
    let { x: x1, y: y1, width: w1, height: h1 } = s1
    let { x: x2, y: y2, width: w2, height: h2 } = s2
    w1 |= 0; h1 |= 0; w2 |= 0; h2 |= 0
    if (x1 > x2 + w2) return false
    if (x2 > x1 + w1) return false
    if (y1 > y2 + h2) return false
    if (y2 > y1 + h1) return false
    return true
}

// text

export class Text extends Sprite {
    getboundaryAlign() {
        if (this.textAlign) return this.textAlign
        const { anchorX } = this
        if (anchorX === 0) return "left"
        if (anchorX === 1) return "right"
        return "center"
    }
    getTextAlign() {
        if (this.textAlign) return this.textAlign
        const { anchorX } = this
        if (anchorX === 0) return "left"
        if (anchorX === 1) return "right"
        return "center"
    }
    getImg(dt) {
        const val = _mayCall(this.value)
        if (val !== this.prevValue) {
            this.prevValue = val
            const vals = val.split('\n')
            const can = this.img = _createCan(1, 1), ctx = _ctx(can)
            const font = ctx.font = this.font || "20px Georgia"
            const lineHeight = this.lineHeight || parseInt(ctx.font)
            let width = 0, height = 0
            for (let val of vals) {
                width = max(width, ctx.measureText(val).width)
                height += lineHeight
            }
            this.width = can.width = ceil(width)
            this.height = can.height = ceil(height)
            ctx.font = font
            ctx.fillStyle = this.color || "black"
            ctx.textAlign = this.getTextAlign()
            ctx.textBaseline = "top"
            let x = 0
            if (ctx.textAlign === "center") x = floor(width / 2)
            if (ctx.textAlign === "right") x = width
            for (let i in vals)
                ctx.fillText(vals[i], x, i * lineHeight)
        }
        return this.img
    }
}

// html

export class HtmlSprite extends Sprite {

    static {
        assign(this.prototype, {
            anim: null,
        })
    }

    start(){
        super.start()
        this.initHtml()
    }

    initHtml() {
        this.html = toHtml(this.html)
        this.syncHtmlPos()
        this.game.wrapEl.appendChild(this.html)
    }
    toHtmlPos(val, ref){
        return `${floor(val/ref*100)}%`
    }
    syncHtmlPos(){
        const scn = this.scene
        const { x, y, width, height } = this.getBoundaries()
        assign(this.html.style, {
            display: "block",
            position: "absolute",
            left: this.toHtmlPos(x, scn.width),
            top: this.toHtmlPos(y, scn.height),
            width: this.toHtmlPos(width, scn.width),
            height: this.toHtmlPos(height, scn.height),
        })
    }

    remove(){
        super.remove()
        this.html.remove()
    }
}

function toHtml(html) {
    if(html instanceof HTMLElement) {
        return html
    } else if(typeof html === "string") {
        const div = document.createElement("div")
        div.innerHTML = html
        return div.children[0]
    } else throw "Bad type"
}

// input

export class InputSprite extends HtmlSprite {

    constructor(scn, kwargs) {
        super(scn, {
            html: "<input type='text' />",
            ...kwargs
        })
    }

    start() {
        super.start()
        if(this.font) this.html.style.font = this.font
        if(this.color) this.html.style.color = this.color
        if(this.placeholder) this.html.setAttribute("placeholder", this.placeholder)
        this.html.style.textAlign = this.getTextAlign()
        this.html.style.fontSize = floor(this.html.offsetHeight*.5) + 'px'
        this.html.addEventListener("keyup", evt => {
            this.trigger("keyup", this.html.value)
            if(evt.key === "Enter") this.onValue(this.html.value)
        })
        if(this.value) this.html.value = this.value
        this.html.focus()
    }
    getTextAlign() {
        if (this.textAlign) return this.textAlign
        const { anchorX } = this
        if (anchorX === 0) return "left"
        if (anchorX === 1) return "right"
        return "center"
    }
    onValue(val) {
        this.value = val
        this.trigger("input", val)
    }
}

// volume button

let volumeMuted = false

const volumeSS = new SpriteSheet(absPath('assets/volume.png'), {
    frameWidth: 50,
    frameHeight: 50
})

const VolumeAnims = [0, 1].map(i => new Anim(volumeSS.getFrame(i)))

export class VolumeBut extends Sprite {

    constructor(...args) {
        super(...args)
        this.syncAnim()
        this.on("click", () => {
            volumeMuted = !volumeMuted
            setVolumeLevel(volumeMuted ? 0 : 1)
            this.syncAnim()
        })
    }
    syncAnim() {
        this.anim = VolumeAnims[volumeMuted ? 1 : 0]
    }
}

// fullscreen button

const fullscreenSS = new SpriteSheet(absPath('assets/fullscreen.png'), {
    frameWidth: 50,
    frameHeight: 50
})

const FullscreenAnims = [0, 1].map(i => new Anim(fullscreenSS.getFrame(i)))

export class FullscreenBut extends Sprite {

    constructor(...args) {
        super(...args)
        this.syncAnim()
        const fsEl = this.game.parentEl
        this.on("click", async () => {
            if(document.fullscreenElement) {
                document.exitFullscreen()
            } else {
                await fsEl.requestFullscreen()
            }
        })
        fsEl.addEventListener("fullscreenchange", () => this.syncAnim())
    }

    syncAnim() {
        this.anim = FullscreenAnims[document.fullscreenElement ? 0 : 1]
    }
}

// pause button

const playPauseSS = new SpriteSheet(absPath('assets/play_pause.png'), {
    frameWidth: 50,
    frameHeight: 50
})

const PlayPauseAnims = [0, 1].map(i => new Anim(playPauseSS.getFrame(i)))

export class PauseBut extends Sprite {

    constructor(...args) {
        super(...args)
        this.syncAnim()
        this.on("click", () => {
            this.game.pause(!this.game.paused)
        })
        this.game.on("pause", () => this.syncAnim())
    }

    syncAnim() {
        this.anim = PlayPauseAnims[this.game.paused ? 0 : 1]
    }
}

// flash

export class Flash extends Sprite {

    static {
        assign(this.prototype, {
            ttl: .15,
        })
    }

    update(dt) {
        super.update(dt)
        if (this.time > this.ttl) this.remove()
    }
    drawTo(ctx, dt=0, viewX=0, viewY=0) {
        const rgb = this.rgb || "255,255,255"
        const age = 1 - this.time / this.ttl
        const { width, height } = this
        const size = min(width, height), center = size / 2
        const grd = ctx.createRadialGradient(
            center, center, .4 * size,
            center, center, (.3 * age + .7) * size);
        grd.addColorStop(0, `rgba(${rgb}, 0)`)
        grd.addColorStop(1, `rgba(${rgb}, ${1 - age})`)
        if (width > height) ctx.setTransform(width / height, 0, 0, 1, 0, 0)
        else ctx.setTransform(1, 0, 0, height / width, 0, 0)
        ctx.fillStyle = grd
        ctx.fillRect(~~viewX, ~~viewY, size, size)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
}

// tiler

export class Tiler {

    static {
        assign(this.prototype, {
            addedMinNx: 1,
            addedMinNy: 1,
            addedMaxNx: 0,
            addedMaxNy: 0,
        })
    }

    constructor(scn, tileWidth, tileHeight) {
        this.scene = scn
        this.tileWidth = tileWidth
        this.tileHeight = tileHeight
    }

    getNxRange() {
        return [
            floor(this.scene.viewX/this.tileWidth),
            floor((this.scene.viewX + this.scene.width)/this.tileWidth)
        ]
    }

    getNyRange() {
        return [
            floor(this.scene.viewY/this.tileHeight),
            floor((this.scene.viewY + this.scene.height)/this.tileHeight)
        ]
    }

    addNewTiles() {
        const { addedMinNx, addedMinNy, addedMaxNx, addedMaxNy } = this
        let _addedMinNx = addedMinNx
        let _addedMinNy = addedMinNy
        let _addedMaxNx = addedMaxNx
        let _addedMaxNy = addedMaxNy
        const [minNx, maxNx] = this.getNxRange()
        const [minNy, maxNy] = this.getNyRange()
        for(let nx = minNx; nx <= maxNx; ++nx) {
            for(let ny = minNy; ny <= maxNy; ++ny) {
                if(nx >= addedMinNx && nx <= addedMaxNx && ny >= addedMinNy && ny <= addedMaxNy) continue
                this.addTile(nx, ny)
                _addedMinNx = min(_addedMinNx, nx)
                _addedMinNy = min(_addedMinNy, ny)
                _addedMaxNx = max(_addedMaxNx, nx)
                _addedMaxNy = max(_addedMaxNy, ny)
            }
        }
        this.addedMinNx = _addedMinNx
        this.addedMinNy = _addedMinNy
        this.addedMaxNx = _addedMaxNx
        this.addedMaxNy = _addedMaxNy
    }
}