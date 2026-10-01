package main

import (
	"./engine"
	"./engine/assets"
	"./engine/systems"
	"./game"
	"js:./interop.d.ts"
)

// coreResources is loaded before the arena so shared assets (dirt overlay,
// skybox, weapons, pickups, sounds) are resident for every map.
var coreResources = []string{"resources.list"}

// initEngine wraps the callback-based engine.Init in a Promise.
func initEngine() any {
	return Reflect.construct(Promise, []any{func(resolve any, reject any) {
		engine.Init(systems.ActiveSettings.UseWebGPU, func() { resolve(nil) })
	}})
}

func sleep(ms int) any {
	return Reflect.construct(Promise, []any{func(resolve any, reject any) {
		setTimeout(func() { resolve(nil) }, ms)
	}})
}

async func boot() any {
	systems.ActiveSettings.Load()
	systems.GlobalConsole.Mount()
	game.GlobalUI.Mount()
	game.GlobalHUD.Mount(systems.ActiveSettings.IsMobile)
	game.GlobalLoading.Mount()
	game.GlobalLoading.Toggle(true)

	await initEngine()
	systems.GlobalInput.Attach()

	assets.GlobalResources.Init()
	await assets.GlobalResources.Load(coreResources)
	engine.DirtTexture = assets.GlobalResources.GetTexture("system/dirt.webp")

	g := game.NewDefaultGame()
	ok := await g.Load("demo")
	if !ok {
		systems.GlobalConsole.Error("Critical Game Initialization Failure: arena failed to load")
		return nil
	}
	// Networking keeps ticking while the engine is paused.
	engine.SetCallbacks(
		func(dt float32) { g.Update(dt) },
		func(dt float32) { g.Multiplayer.Update(dt / 1000) },
	)

	g.Controls.Init()
	game.GlobalState.Init()
	g.Init()
	game.GlobalUpdate.Init()

	// Render one frame behind the blur before revealing the menu.
	game.GlobalState.EnterGame()
	engine.Start()
	await sleep(100)
	game.GlobalLoading.Toggle(false)
	game.GlobalState.EnterMenu("MAIN_MENU")
	return nil
}

func main() {
	boot().catch(func(err any) {
		console.error("Critical Game Initialization Failure:", err)
	})
}
