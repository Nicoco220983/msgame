const { abs, floor, min, max, pow, random: rand, cos } = Math
const { log } = console

import * as MSG from './msgame.js'
const { Game, Scene, Sprite, SpriteSheet, Anim, Text, Aud } = MSG
const { randge, range, bound } = MSG

// main

function startGame() {
    const canvas = MSG.createCanvas(WIDTH, HEIGHT, { fitWindow: true })
    document.body.appendChild(canvas)
    const game = new StarterGame(canvas)
    game.initLoop()
}

// game

const WIDTH = 400, HEIGHT = 600
const RUN_SPD = 400
const ANCHOR_X = .5
const ANCHOR_Y = 1
const DURATION = 15

const VOLUME_LEVEL = 0.3

class StarterGame extends Game {
    constructor(...args) {
        super(...args)
        this.paused = false
        document.addEventListener("focus", () => this.pause(false))
        document.addEventListener("blur", () => this.pause(true))
        this.addPointerDownListener(pos => {
            this.addVolumeBut()
            this.scene.trigger("click", pos)
            if (MSG.collide(this.volumeBut, pos))
                this.volumeBut.trigger("click")
        })
    }
    start() {
        this.scene = new StarterScene(this)
    }
    update(dt) {
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
        if(this.volumeBut) this.volumeBut.drawTo(ctx, dt, 0, 0)
    }
    addVolumeBut() {
        if(!this.volumeBut)
            this.volumeBut = new VolumeBut(this, { x: this.width - 50, y: 50 })
    }
    pause(val) {
        if (val === this.paused) return
        this.paused = val
        MSG.pauseAudios(val)
    }
}

// scene

class StarterScene extends Scene {
    constructor(...args) {
        super(...args)
        this.viewY = 0
        this.state = "START"
        this.sprites = []
        this.backSprites = []
        this.fixedSprites = []
        this.start()
    }
    add(cls, kwargs) {
        const sprite = new cls(this, kwargs)
        this.sprites.push(sprite)
        return sprite
    }
    addBack(cls, kwargs) {
        const sprite = new cls(this, kwargs)
        this.backSprites.push(sprite)
        return sprite
    }
    addFixed(cls, kwargs) {
        const sprite = new cls(this, kwargs)
        this.fixedSprites.push(sprite)
        return sprite
    }
    update(dt) {
        super.update(dt)
        if (this.state == "ONGOING") {
            this.viewY -= RUN_SPD * dt
            StarterScene.updaters.forEach(fn => fn(this))
            for(let name of ["sprites", "backSprites", "fixedSprites"])
                this[name].forEach(s => s.update(dt))
            for(let name of ["sprites", "backSprites"])
                this[name].forEach(removeIfOut)
            for(let name of ["sprites", "backSprites", "fixedSprites"])
                this[name] = this[name].filter(s => !s.removed)
            if (this.time > DURATION + 3) this.finish()
        }
    }
    draw(dt) {
        const ctx = this.canvas.getContext("2d")
        this.backSprites.forEach(s => s.drawTo(ctx, dt, 0, this.viewY))
        this.sprites.sort((a, b) => a.y > b.y)
        this.sprites.forEach(s => s.drawTo(ctx, dt, 0, this.viewY))
        this.fixedSprites.forEach(s => s.drawTo(ctx, dt, 0, 0))
    }
    start() {
        this.state = "START"
        this.addIntroSprites()
        this.on("click", () => this.ongoing())
        StarterScene.starters.forEach(fn => fn(this))
    }
    addIntroSprites() {
        this.introSprites = []
        const addIntro = (cls, kwargs) => {
            const sprite = this.add(cls, kwargs)
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
        if (this.state != "START") return
        this.state = "ONGOING"
        StarterScene.ongoers.forEach(fn => fn(this))
        const aud = new Aud('./assets/music.mp3')
        MSG.waitLoads(aud).then(() => aud.replay({ baseVolume: .2, loop: true }))
        this.on("remove", () => aud.pause())
    }
    finish() {
        this.state = "END"
        this.hero.anim = HeroAnims.happy
        let x = WIDTH / 2
        let font = "30px Arial"
        const anchorX = .5, anchorY = 0
        this.addFixed(Text, {
            x, y: 200,
            font, anchorX, anchorY,
            value: `SCORE: ${this.score}`
        })
        font = "20px Arial"
        let text = "J'espere que ce jeu vous a plu ;)"
        this.addFixed(Text, {
            x, y: 300,
            font, anchorX, anchorY,
            value: text,
            lineHeight: 40
        })
        this.addFixed(Text, {
            x, y: 550,
            font, anchorX, anchorY,
            value: `Touchez pour recommencer`
        })
        this.on("click", () => {
            this.remove()
            this.game.start()
        })
    }
}
StarterScene.starters = []
StarterScene.ongoers = []
StarterScene.updaters = []

function removeIfOut(sprite) {
    const scn = sprite.scene
    if((sprite.y - sprite.height) > ( scn.viewY + scn.height)) {
        console.log("removed")
        sprite.remove()
    }
}

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

const volumeSS = new SpriteSheet('./assets/volume.png', {
    frameWidth: 50,
    frameHeight: 50
})

const VolumeAnims = [0, 1].map(i => new Anim(volumeSS.getFrame(i)))

class VolumeBut extends Sprite {
    constructor(...args) {
        super(...args)
        this.width = 50
        this.height = 50
        this.anchorX = .5
        this.anchorY = .5
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

// common

class Notif extends Text {
    constructor(...args) {
        super(...args)
    }
    update(dt) {
        super.update(dt)
        this.y -= 20 * dt
        if (this.time > .5) this.remove()
    }
}
Notif.prototype.anchorX = .5
Notif.prototype.anchorY = 1

// time

StarterScene.ongoers.push(scn => {
    scn.time = 0
    scn.addFixed(Text, {
        x: 10,
        y: 35,
        value: () => `Time: ${max(0, floor(DURATION - scn.time))}`
    })
})

// background

const TILES_FRAME_SIZE = 50

const TilesAnim = new Anim('./assets/tiles.png')

let LastTilesSprite

StarterScene.starters.push(scn => {
    const nbTilesY = HEIGHT / TILES_FRAME_SIZE
    for (let j = nbTilesY; j >= 0; --j) {
        createTilesRow(scn, {
            y: j * TILES_FRAME_SIZE
        })
    }
})

StarterScene.updaters.push(scn => {
    if (LastTilesSprite.y > -TILES_FRAME_SIZE+scn.viewY)
        createTilesRow(scn, {
            y: LastTilesSprite.y - TILES_FRAME_SIZE
        })
})

function createTilesRow(scn, kwargs) {
    const nbTiles = WIDTH / TILES_FRAME_SIZE
    for (let i = 0; i < nbTiles; ++i) {
        kwargs.x = i * TILES_FRAME_SIZE
        LastTilesSprite = createTilesSprite(scn, kwargs)
    }
}

function createTilesSprite(scn, kwargs) {
    const sprite = scn.addBack(Sprite, {
        width: TILES_FRAME_SIZE,
        height: TILES_FRAME_SIZE
    })
    sprite.autoTransformImg = false
    Object.assign(sprite, kwargs)
    sprite.anim = TilesAnim
    return sprite
}

// hero

const HERO_Y = 500
const HERO_SIZE = 50
const SPDMAX = 2000, ACC = 2000, DEC = 2000

const heroSS = new SpriteSheet('./assets/hero.png', {
    frameWidth: 30,
    frameHeight: 30
})
const HeroAnims = {
    ready: new Anim(heroSS.getFrame(0)),
    run: new Anim(range(1, 3).map(i => heroSS.getFrame(i)), { fps: 1 }),
    happy: new Anim(heroSS.getFrame(3)),
    aouch: new Anim(heroSS.getFrame(4)),
}

const ouchAud = new Aud('./assets/ouch.mp3', { baseVolume: .2 })

class Hero extends Sprite {
    constructor(...args) {
        super(...args)
        this.anim = HeroAnims.ready
        this.width = HERO_SIZE
        this.height = HERO_SIZE
        this.anchorX = ANCHOR_X
        this.anchorY = ANCHOR_Y
        this.dx = 0
    }
}

StarterScene.starters.push(scn => {
    scn.hero = scn.add(Hero, {
        x: scn.width / 2,
        y: HERO_Y,
        damageTime: null
    })
    scn.hero.autoTransformImg = false
    scn.hero.on("update", function() {
        this.y = HERO_Y + this.scene.viewY
    })
    scn.hero.damage = function (n) {
        scn.score -= n
        scn.addFixed(Notif, {
            x: this.x,
            y: HERO_Y - 50,
            value: "-" + n,
            color: "red"
        })
        scn.addFixed(MSG.Flash, {
            width: WIDTH,
            height: HEIGHT,
            rgb: "255,0,0"
        })
        this.damageTime = this.time
        ouchAud.replay()
    }
})

StarterScene.ongoers.push(scn => {
    const game = scn.game, hero = scn.hero
    hero.anim = HeroAnims.run
    hero.on("update", function (dt) {
        if(this.damageTime !== null && this.time < this.damageTime + 1) {
            this.anim = HeroAnims.aouch
            this.animAlpha = ((this.time - this.damageTime) / .2) % 1 < .5
        } else {
            this.anim = HeroAnims.run
            delete this.animAlpha
        }
        if (game.pointer.isDown) {
            this.dx = MSG.accToPos(this.x, game.pointer.x, this.dx, SPDMAX, ACC, DEC, dt)
        } else {
            this.dx = MSG.accToSpd(this.dx, 0, ACC, DEC, dt)
        }
        this.x = bound(this.x + this.dx * dt, 25, WIDTH - 25)
    })
})


// score

StarterScene.ongoers.push(scn => {
    scn.score = 10
    scn.addFixed(Text, {
        x: 10,
        y: 10,
        value: () => `Score: ${scn.score}`
    })
})


// enemy

const ENEMY_SIZE = 40

const EnemyAnim = new Anim('./assets/enemy.png')

StarterScene.updaters.push(scn => {
    if (scn.time > DURATION) return
    const nextTime = scn.enemyNextTime || 0
    if (scn.time > nextTime) {
        createEnemy(scn)
        scn.enemyNextTime = scn.time + randge(.3, .7)
    }
})

function createEnemy(scn) {
    const sprite = scn.add(Sprite, {
        x: ENEMY_SIZE / 2 + rand() * (WIDTH - ENEMY_SIZE / 2),
        y: scn.viewY,
        anim: EnemyAnim,
        width: ENEMY_SIZE,
        height: ENEMY_SIZE,
        anchorX: ANCHOR_X,
        anchorY: ANCHOR_Y,
        score: 1
    })
    sprite.autoTransformImg = false
    sprite.on("update", function () {
        if (MSG.collide(this, scn.hero)) this.onCollide()
    })
    sprite.onCollide = function () {
        if(!this.collided)
            scn.hero.damage(this.score)
        this.collided = true
    }
}

// start

startGame()
