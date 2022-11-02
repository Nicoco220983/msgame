const { abs, floor, min, max, pow, random: rand, cos } = Math
const { log } = console

import * as MSG from './msgame.js'
const { Game, Scene, Sprite, SpriteSheet, Anim, Text, Aud } = MSG
const { randge, range, bound } = MSG

// game

const WIDTH = 400, HEIGHT = 600
const RUN_SPD = 400
const ANCHOR_X = .5
const ANCHOR_Y = 1
const DURATION = 15

const VOLUME_LEVEL = 0.3

export class ExampleGame extends Game {

    paused = false
    width = WIDTH
    height = HEIGHT

    start() {
        super.start()
        document.addEventListener("focus", () => this.pause(false))
        document.addEventListener("blur", () => this.pause(true))
        this.addGameButtons()
        this.addPointerDownListener(pos => {
            for(let but of this.gameButs) {
                if (MSG.collide(but, pos)) {
                    but.trigger("click")
                    return
                }
            }
            this.scene.trigger("click", pos)
        })
        this.restart()
    }
    restart() {
        this.scene = new ExampleScene(this)
    }
    update(dt) {
        super.update(dt)
        if(this.paused) {
            if(!this.pauseScene) this.pauseScene = new PauseScene(this)
            this.pauseScene.update(dt)
            return
        }
        this.scene.update(dt)
    }
    draw(dt) {
        const ctx = this.canvas.getContext("2d")
        this.scene.drawTo(ctx, this.paused ? 0 : dt)
        if(this.paused) this.pauseScene.drawTo(ctx, dt)
        for(let but of this.gameButs)
            but.drawTo(ctx, dt, 0, 0)
    }
    addGameButtons() {
        this.gameButs = []
        for(let cls of [VolumeBut, FulscreenBut]) {
            this.gameButs.push(new cls(this, {
                x: this.width - 60 * (this.gameButs.length + 1) + 25,
                y: 35
            }))
        }
    }
    pause(val) {
        if (val === this.paused) return
        this.paused = val
        MSG.pauseAudios(val)
    }
}

// scene

class ExampleScene extends Scene {

    step = null

    start() {
        super.start()
        this.step = "START"
        this.addIntroSprites()
        this.once("click", () => this.ongoing())
        this.initHero()
        ExampleScene.starters.forEach(fn => fn(this))
    }
    initHero(){
        this.hero = this.addSprite(Hero, {
            x: this.width / 2,
            y: HERO_Y,
        })
    }
    update(dt) {
        super.update(dt)
        if (this.step == "ONGOING") {
            this.viewY -= RUN_SPD * dt
            ExampleScene.updaters.forEach(fn => fn(this))
            if (this.time > DURATION + 3) this.finish()
        }
    }
    draw(dt) {
        const viewX = this.viewX, viewY = this.viewY, ctx = this.canvas.getContext("2d")
        this.sprites.sort((a, b) => {
            const dz = (a.z - b.z)
            if(dz !== 0) return dz > 0
            return (a.y - b.y) > 0
        })
        this.sprites.forEach(sprite => {
            if(sprite.removed) return
            const viewF = sprite.viewF === undefined ? 1 : sprite.viewF
            sprite.drawTo(ctx, dt, viewX * viewF, viewY * viewF)
        })
    }
    addIntroSprites() {
        this.introSprites = []
        const addIntro = (cls, kwargs) => {
            const sprite = this.addSprite(cls, kwargs)
            this.introSprites.push(sprite)
        }
        const args = {
            x: WIDTH / 2,
            font: "20px Arial",
            anchorX: .5,
            anchorY: 0
        }
        addIntro(Text, {
            ...args, y: 60,
            value: "MsGame",
            font: "60px Arial",
        })
        addIntro(Text, {
            ...args, y: 130,
            value: "What a light game engine !",
            lineHeight: 30
        })
        addIntro(Text, {
            ...args, y: 550,
            value: "Touchez pour commencer"
        })
    }
    ongoing() {
        if (this.step != "START") return
        this.step = "ONGOING"
        ExampleScene.ongoers.forEach(fn => fn(this))
        const aud = new Aud(absPath('assets/music.mp3'))
        MSG.waitLoads(aud).then(() => aud.replay({ baseVolume: .2, loop: true }))
        this.once("remove", () => aud.pause())
    }
    finish() {
        this.step = "END"
        this.hero.anim = HeroAnims.happy
        const args = {
            x: WIDTH / 2,
            font: "30px Arial",
            anchorX: .5,
            anchorY: 0,
            z: 10,
            viewF: 0
        }
        this.addSprite(Text, {
            ...args,
            y: 200,
            value: `SCORE: ${this.score}`,
        })
        args.font = "20px Arial"
        this.addSprite(Text, {
            ...args,
            y: 300,
            value: "J'espere que ce jeu vous a plu ;)",
            lineHeight: 40,
        })
        this.addSprite(Text, {
            ...args,
            y: 550,
            value: `Touchez pour recommencer`,
        })
        this.once("click", () => {
            this.remove()
            this.game.restart()
        })
    }
}
ExampleScene.starters = []
ExampleScene.ongoers = []
ExampleScene.updaters = []

// pause

class PauseScene extends Scene {
    constructor(...args) {
        super(...args)
        this.initCanvas()
    }
    initCanvas() {
        // background
        const ctx = this.canvas.getContext("2d")
        ctx.fillStyle = "rgb(0,0,0,0.5)"
        ctx.fillRect(0, 0, this.width, this.height)
        // text
        const text = new Text(this, {
            x: this.width/2,
            y: this.height/2,
            font: "40px Arial",
            anchorX: .5,
            anchorY: .5,
            value: "Pause"
        })
        text.drawTo(ctx, 0, 0, 0)
    }
}

// volume

let volumeMuted = false

MSG.setVolumeLevel(VOLUME_LEVEL)

const volumeSS = new SpriteSheet(absPath('assets/volume.png'), {
    frameWidth: 50,
    frameHeight: 50
})

const VolumeAnims = [0, 1].map(i => new Anim(volumeSS.getFrame(i)))

class VolumeBut extends Sprite {

    width = 50
    height = 50
    anchorX = .5
    anchorY = .5

    constructor(...args) {
        super(...args)
        this.syncAnim()
        this.on("click", () => {
            volumeMuted = !volumeMuted
            MSG.setVolumeLevel(volumeMuted ? 0 : VOLUME_LEVEL)
            this.syncAnim()
        })
    }
    syncAnim() {
        this.anim = VolumeAnims[volumeMuted ? 1 : 0]
    }
}

// fullscreen

const fullscreenSS = new SpriteSheet(absPath('assets/fullscreen.png'), {
    frameWidth: 50,
    frameHeight: 50
})

const FullscreenAnims = [0, 1].map(i => new Anim(fullscreenSS.getFrame(i)))

class FulscreenBut extends Sprite {

    width = 50
    height = 50
    anchorX = .5
    anchorY = .5

    constructor(...args) {
        super(...args)
        this.isFullscreen = false
        this.syncAnim()
        this.on("click", async () => {
            if(this.isFullscreen) {
                document.exitFullscreen()
            } else {
                await this.game.parentEl.requestFullscreen()
            }
            this.isFullscreen = !this.isFullscreen
            this.syncAnim()
        })
    }

    syncAnim() {
        this.anim = FullscreenAnims[this.isFullscreen ? 0 : 1]
    }
}

// common

class _Sprite extends Sprite {
    update(dt) {
        super.update(dt)
        // remove if out
        const scn = this.scene
        if((this.y - this.height) > ( scn.viewY + scn.height)) {
            this.remove()
        }
    }
}

class Notif extends Text {

    z = 10
    viewF = 0

    update(dt) {
        super.update(dt)
        this.y -= 20 * dt
        if (this.time > .5) this.remove()
    }
}
Notif.prototype.anchorX = .5
Notif.prototype.anchorY = 1

// time

ExampleScene.ongoers.push(scn => {
    scn.addSprite(Text, {
        x: 10,
        y: 35,
        value: () => `Time: ${max(0, floor(DURATION - scn.time))}`,
        z: 10,
        viewF: 0
    })
})

// background

const TILE_SIZE = 50

const TilesAnim = new Anim(absPath('assets/tiles.png'))

ExampleScene.starters.push(scn => {
    scn.tiler = new _Tiler(scn)
    scn.tiler.addNewTiles()
})

ExampleScene.updaters.push(scn => {
    scn.tiler.addNewTiles()
})

class Tile extends _Sprite {
    width = TILE_SIZE
    height = TILE_SIZE
    z = -1
    anim = TilesAnim
}

class _Tiler extends MSG.Tiler {

    tileWidth = TILE_SIZE
    tileHeight = TILE_SIZE

    addTile(nx, ny) {
        this.scene.addSprite(Tile, {
            x: nx * TILE_SIZE,
            y: ny * TILE_SIZE,
        })
    }
}

// hero

const HERO_Y = 500
const HERO_SIZE = 50
const SPDMAX = 2000, ACC = 2000, DEC = 2000
const DAMAGE_GRACE_TIME = 1

const heroSS = new SpriteSheet(absPath('assets/hero.png'), {
    frameWidth: 30,
    frameHeight: 30
})
const HeroAnims = {
    ready: new Anim(heroSS.getFrame(0)),
    run: new Anim(range(1, 3).map(i => heroSS.getFrame(i)), { fps: 1 }),
    happy: new Anim(heroSS.getFrame(3)),
    aouch: new Anim(heroSS.getFrame(4)),
}

const ouchAud = new Aud(absPath('assets/ouch.mp3'), { baseVolume: .2 })

class Hero extends _Sprite {

    y = HERO_Y
    anim = HeroAnims.ready
    width = HERO_SIZE
    height = HERO_SIZE
    anchorX = ANCHOR_X
    anchorY = ANCHOR_Y
    dx = 0
    lastDamageTime = -DAMAGE_GRACE_TIME

    update(dt){
        super.update(dt)
        this.y = HERO_Y + this.scene.viewY
        if(this.scene.step == "ONGOING") {
            this.updAnim(dt)
            this.applyPlayerControls(dt)
        }
    }
    inGrace(){
        return this.time < this.lastDamageTime + DAMAGE_GRACE_TIME
    }
    damage(n) {
        if(this.inGrace()) return
        const scn = this.scene
        scn.score -= n
        scn.addSprite(Notif, {
            x: this.x,
            y: HERO_Y - 50,
            value: "-" + n,
            color: "red"
        })
        scn.addSprite(MSG.Flash, {
            width: WIDTH,
            height: HEIGHT,
            rgb: "255,0,0",
            z: 9,
            viewF: 0
        })
        this.lastDamageTime = this.time
        ouchAud.replay()
    }
    updAnim(dt){
        if(this.inGrace()) {
            this.anim = HeroAnims.aouch
            this.animAlpha = ((this.time - this.lastDamageTime) / .2) % 1 < .5
        } else {
            this.anim = HeroAnims.run
            delete this.animAlpha
        }
    }
    applyPlayerControls(dt){
        const pointer = this.scene.game.pointer
        if (pointer.isDown) {
            this.dx = MSG.accToPos(this.x, pointer.x, this.dx, SPDMAX, ACC, DEC, dt)
        } else {
            this.dx = MSG.accToSpd(this.dx, 0, ACC, DEC, dt)
        }
        this.x = bound(this.x + this.dx * dt, 25, WIDTH - 25)
    }
    getHitBox() {
        const { x, y, width, height } = this.getBoundaries()
        return {
            x: x + 25,
            y,
            width: width - 50,
            height,
        }
    }
}

ExampleScene.ongoers.push(scn => {
    const game = scn.game, hero = scn.hero
    hero.anim = HeroAnims.run
})


// score

ExampleScene.ongoers.push(scn => {
    scn.score = 10
    scn.addSprite(Text, {
        x: 10,
        y: 10,
        value: () => `Score: ${scn.score}`,
        z: 10,
        viewF: 0
    })
})


// enemy

const ENEMY_SIZE = 40

const EnemyAnim = new Anim(absPath('assets/enemy.png'))

class Enemy extends _Sprite {

    x = ENEMY_SIZE / 2 + rand() * (WIDTH - ENEMY_SIZE / 2)
    y = this.scene.viewY
    anim = EnemyAnim
    width = ENEMY_SIZE
    height = ENEMY_SIZE
    anchorX = ANCHOR_X
    anchorY = ANCHOR_Y
    score = 1

    update(dt){
        super.update(dt)
        if (MSG.collide(this, this.scene.hero.getHitBox()))
            this.onCollide(this.scene.hero)
    }
    onCollide(hero) {
        if(!this.collided)
            hero.damage(this.score)
        this.collided = true
    }
}

ExampleScene.updaters.push(scn => {
    if (scn.time > DURATION) return
    const nextTime = scn.enemyNextTime || 0
    if (scn.time > nextTime) {
        scn.addSprite(Enemy)
        scn.enemyNextTime = scn.time + randge(.3, .7)
    }
})

// utils

function absPath(relPath){
    const url = new URL(relPath, import.meta.url)
    return url.pathname
}