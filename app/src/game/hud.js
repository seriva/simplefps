import { css, html, Reactive } from "../dependencies/reactive.js";
import { Settings } from "../engine/engine.js";
import { Player } from "./player.js";
import { State } from "./state.js";

// ============================================================================
// Private
// ============================================================================

class _HUDUI extends Reactive.Component {
	constructor() {
		super();
		this._isMobile = Settings.isMobile;
	}

	state() {
		return {
			visible: this.signal(true, "hud:visible"),
		};
	}

	styles() {
		return css`
            #hud {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 3000;
                background-color: transparent;
                display: none;
                pointer-events: none;
            }

            #hud.visible {
                display: block;
            }

            #button-menu {
                position: absolute;
                right: 5vmin;
                top: 5vmin;
                width: 18vmin;
                height: 18vmin;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(40, 40, 40, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-sizing: border-box;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(4px);
                color: rgba(255, 255, 255, 0.9);
                transition: transform 0.1s ease, background 0.2s;
                pointer-events: auto;
            }

            #button-menu:active,
            #button-menu.pressed {
                transform: scale(0.9);
                background: rgba(80, 80, 80, 0.9);
                border-color: rgba(255, 255, 255, 0.5);
            }

            #button-menu svg {
                width: 6vmin;
                height: 6vmin;
                fill: currentColor;
            }

            #crosshair {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                z-index: 1;
                background-image: url(resources/crosshair.svg);
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
            }

            #player-stats {
                position: fixed;
                bottom: max(2vmin, env(safe-area-inset-bottom));
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                display: flex;
                flex-direction: row;
                gap: 7vmin;
                pointer-events: none;
                font-family: "Inter", "Segoe UI", system-ui, sans-serif;
                padding: 2.5vmin 6vmin;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 16px;
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .stat-item {
                display: flex;
                align-items: center;
                gap: 3vmin;
            }

            .stat-icon {
                width: 6vmin;
                height: 6vmin;
                fill: currentColor;
            }

            .stat-icon.health {
                color: #ff4d4d;
            }
            .stat-icon.armor {
                color: #4d94ff;
            }
            .stat-icon.ammo {
                color: #ffcc00;
            }

            .stat-value {
                font-size: 5.5vmin;
                font-weight: 700;
                color: #ffffff;
                font-variant-numeric: tabular-nums;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
            }

            @keyframes scale-icon {
                0% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.5);
                }
                100% {
                    transform: scale(1);
                }
            }

            .icon-animate {
                animation: scale-icon 0.3s ease-in-out;
            }

            @media (min-width: 1024px) {
                .stat-icon { width: 48px; height: 48px; }
                .stat-item { gap: 12px; }
                .stat-value { font-size: 32px; }
                #player-stats {
                    bottom: 32px;
                    gap: 64px;
                    padding: 24px 48px;
                    border-radius: 24px;
                }
            }
        `;
	}

	template() {
		return html`
            <div id="hud" data-class-visible="visible">
                ${
									this._isMobile
										? html` <div id="button-menu" data-ref="menuBtn">
                          <svg viewBox="0 0 24 24">
                              <path
                                  d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
                              />
                          </svg>
                      </div>`
										: html``
								}
                <div id="crosshair"></div>
                <div id="player-stats">
                    <div class="stat-item">
                        <svg
                            class="stat-icon health"
                            data-ref="healthIcon"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                            />
                        </svg>
                        <span class="stat-value" data-ref="healthVal">100</span>
                    </div>
                    <div class="stat-item">
                        <svg
                            class="stat-icon armor"
                            data-ref="armorIcon"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
                            />
                        </svg>
                        <span class="stat-value" data-ref="armorVal">0</span>
                    </div>
                    <div class="stat-item">
                        <svg
                            class="stat-icon ammo"
                            data-ref="ammoIcon"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M7 2h10v2H7zm0 4h10v2H7zm0 4h10v2H7zM7 14h10v2H7zm0 4h10v2H7z"
                            />
                        </svg>
                        <span class="stat-value" data-ref="ammoVal">50</span>
                    </div>
                </div>
            </div>
        `;
	}

	mount() {
		if (this._isMobile) {
			this.on(this.refs.menuBtn, "touchstart", () => {
				this.refs.menuBtn.classList.add("pressed");
			});
			this.on(this.refs.menuBtn, "touchend", () => {
				this.refs.menuBtn.classList.remove("pressed");
				State.enterMenu("MAIN_MENU");
			});
			this.on(this.refs.menuBtn, "touchcancel", () => {
				this.refs.menuBtn.classList.remove("pressed");
			});
		}

		// Subscribe to state changes to toggle visibility
		this.track(
			State.signal.subscribe((state) => {
				this.toggle(state === "GAME");
			}),
		);

		// Subscribe to player stats for HUD bars
		const trackStat = (signal, type) => {
			let prev = signal.get();
			this.track(
				signal.subscribe((v) => {
					this.refs[`${type}Val`].textContent = v;
					if (v > prev) this.triggerAnimation(type);
					prev = v;
				}),
			);
		};

		trackStat(Player.health, "health");
		trackStat(Player.armor, "armor");
		trackStat(Player.ammo, "ammo");
	}

	triggerAnimation(type) {
		const iconRef = this.refs[`${type}Icon`];
		if (!iconRef) return;

		// Reset animation if currently playing
		iconRef.classList.remove("icon-animate");

		// Trigger reflow to restart animation
		void iconRef.offsetWidth;

		iconRef.classList.add("icon-animate");
		iconRef.addEventListener(
			"animationend",
			() => iconRef.classList.remove("icon-animate"),
			{ once: true },
		);
	}

	toggle(show) {
		if (show === undefined) {
			this.visible.set(!this.visible.get());
		} else {
			this.visible.set(show);
		}
	}
}

// HUD UI singleton
const _ui = new _HUDUI();
_ui.appendTo("body");

// ============================================================================
// Public API
// ============================================================================

const HUD = {
	toggle(show) {
		_ui.toggle(show);
	},
};

export { HUD };
