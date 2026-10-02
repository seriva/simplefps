package game

// PlayerState holds the local player's stats (player.js). OnChange fires
// after every mutation so the HUD can mirror the values.
type PlayerState struct {
	Health int
	Armor  int
	Ammo   int

	OnChange func(health, armor, ammo int)
}

// NewPlayerState returns a player at the default stats.
func NewPlayerState() *PlayerState {
	return &PlayerState{
		Health: PlayerDefaultHealth,
		Armor:  PlayerDefaultArmor,
		Ammo:   PlayerDefaultAmmo,
	}
}

func clampedAdd(value, amount, max int) int {
	v := value + amount
	if v > max {
		return max
	}
	return v
}

func (p *PlayerState) notify() {
	if p.OnChange != nil {
		p.OnChange(p.Health, p.Armor, p.Ammo)
	}
}

// AddHealth adds amount, clamped to PlayerMaxHealth.
func (p *PlayerState) AddHealth(amount int) {
	p.Health = clampedAdd(p.Health, amount, PlayerMaxHealth)
	p.notify()
}

// AddArmor adds amount, clamped to PlayerMaxArmor.
func (p *PlayerState) AddArmor(amount int) {
	p.Armor = clampedAdd(p.Armor, amount, PlayerMaxArmor)
	p.notify()
}

// AddAmmo adds amount, clamped to PlayerMaxAmmo.
func (p *PlayerState) AddAmmo(amount int) {
	p.Ammo = clampedAdd(p.Ammo, amount, PlayerMaxAmmo)
	p.notify()
}

// Reset restores the default stats.
func (p *PlayerState) Reset() {
	p.Health = PlayerDefaultHealth
	p.Armor = PlayerDefaultArmor
	p.Ammo = PlayerDefaultAmmo
	p.notify()
}

// GlobalPlayer is the local player.
var GlobalPlayer = NewPlayerState()
