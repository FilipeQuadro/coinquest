import Phaser from 'phaser'
import { MainRoomScene } from './scenes/MainRoomScene'

export function createCoinQuestGame(parent: HTMLElement) {
  // Keep the full room composition while the parent scales the display.
  const width = 960
  const height = 540

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
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
    },
    scene: [MainRoomScene],
  })
}
