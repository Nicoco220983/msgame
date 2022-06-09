const { abs, floor, ceil, min, max, sqrt, random: rand, cos, sin, atan2 } = Math
const { log } = console

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

// elem

class Elem {

    constructor() {
        this.time = 0
    }

    update(dt) {
        this.time += dt
        this.trigger("update", dt)
    }

    on(evt, callback) {
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
        } else {
            for (let key in callback)
                callbacks[key] = callback[key]
        }
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

    remove() {
        this.removed = true
        this.trigger("remove")
    }

    every(timeKey, period, fun) {
        const lastTime = this[timeKey] || 0
        if (this.time >= lastTime) {
            this[timeKey] = lastTime + _mayCall(period)
            fun()
        }
    }
}

// Game

export class Game extends Elem {
    constructor(canvas, kwargs) {
        super()
        this.canvas = canvas
        Object.assign(this, kwargs)
        canvas.width = this.width
        canvas.height = this.height
        if(kwargs.fitTo) this.fitCanvasTo(kwargs.fitTo)
        // focus
        document.addEventListener("focus", () => this.trigger("focus"))
        document.addEventListener("blur", () => this.trigger("blur"))
        // pointer
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
    fitCanvasTo(el) {
        const WoH = this.width / this.height
        const elW = el.clientWidth, elH = el.clientHeight
        const elWoH = elW / elH
        this.canvas.style.width = ((WoH > elWoH) ? elWoH : floor(elH * WoH)) + "px"
        this.canvas.style.height = ((WoH > elWoH) ? floor(elWoH / WoH) : elH) + "px"
    }
    async initLoop() {
        await waitLoads()
        this.start()
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

    start() {}

    draw(dt) {}

    // pointer

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
}
Object.assign(Game.prototype, {
    fps: 60,
    dblClickDurarion: .3
})

// Scene

export class Scene extends Elem {
    constructor(game, kwargs) {
        super()
        this.game = game
        this.width = game.width
        this.height = game.height
        Object.assign(this, kwargs)
        this.canvas = _createCan(this.width, this.height)
    }
    drawTo(gameCtx, dt=0, viewX=0, viewY=0) {
        this.draw(dt)
        gameCtx.drawImage(this.canvas, ~~(this.x - viewX), ~~(this.y - viewY))
    }
    draw(dt) {}
}
Object.assign(Scene.prototype, {
    x: 0,
    y: 0,
    color: "white"
})

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
    constructor(scn, kwargs) {
        super()
        this.scene = scn
        Object.assign(this, kwargs)
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
        return args
        //if(this.angle) transArgs = this.getImgAngleArgs(img)
    }

    getDefaultAnim() {
        const color = this.anim
        return _getCached(this.__proto__, `dImg:${color}`, () => {
            const size = 10
            const can = _createCan(size, size), ctx = _ctx(can)
            ctx.fillStyle = color
            ctx.fillRect(0, 0, size, size)
            return new Anim(can)
        })
    }
}

Object.assign(Sprite.prototype, {
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    angle: 0,
    anchorX: 0,
    anchorY: 0,
    anim: "black",
    animTime: 0,
    getImgScaleArgs: strechImg
})

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
        Object.assign(this, kwargs)
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
    constructor(imgs, kwargs) {
        this.imgs = _asArr(imgs).map(img => (typeof img === "string") ? new Img(img) : img)
        this.fps = 1
        Object.assign(this, kwargs)
    }
    getImg(time) {
        const imgs = this.imgs
        const numImg = floor(time * this.fps) % imgs.length
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
            const can = _createCan(awidth, aheight), ctx = _ctx(can)
            const alpha = kwargs.alpha
            if(alpha!==undefined && alpha!==null) ctx.globalAlpha = alpha
            ctx.translate(awidth/2, aheight/2)
            ctx.scale(kwargs.flipX ? -1 : 1, kwargs.flipY ? -1 : 1)
            ctx.rotate(angle)
            ctx.drawImage(img, -width/2, -height/2, width, height)
            can.dx = width - awidth
            can.dy = height - aheight
            return can
        })
    }
}

// Img

export class Img extends Image {
    constructor(src, kwargs) {
        super()
        this.src = src
        Object.assign(this, kwargs)
        Loads.push(this)
        this.onload = () => this.loaded = true
        this.onerror = () => this.loadError = `load error: ${src}`
    }
}

// Audio

export const Audios = []
export let VolumeLevel = 1

export class Aud extends Audio {
    constructor(src, kwargs) {
        super()
        this.src = src
        this.baseVolume = 1
        Object.assign(this, kwargs)
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
        Object.assign(this, kwargs)
        this.syncVolume()
        this.play()
    }
    syncVolume() {
        this.volume = this.baseVolume * VolumeLevel
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
    VolumeLevel = val
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
    getAlignText() {
        if (this.alignText) return this.alignText
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
            ctx.textAlign = this.getAlignText()
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

Text.prototype.scaleImg = false

// flash

export class Flash extends Sprite {
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

Flash.prototype.ttl = .15