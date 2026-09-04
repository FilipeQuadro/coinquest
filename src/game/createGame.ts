import Phaser from 'phaser'
import { MainRoomScene } from './scenes/MainRoomScene'

export function createCoinQuestGame(parent: HTMLElement) {
  const width = Math.max(parent.clientWidth, 320)
  const height = Math.max(parent.clientHeight, 260)

  return new Phaser.Game({
    type: __PLAYWRIGHT__ ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    width,
    height,
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    backgroundColor: '#12182e',
    render: {
      pixelArt: true,
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width,
      height,
    },
    scene: [MainRoomScene],
  })
}
