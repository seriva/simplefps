# Multiplayer Networking Architecture

## Overview

SimpleFPS uses a simplified **Client-Authoritative** networking model to enable multiplayer gameplay without a dedicated game server. It leverages [PeerJS](https://peerjs.com/) to establish direct WebRTC connections between a Host browser and Client browsers.

## File Structure

```
app/src/
├── game/
│   ├── multiplayer.js     # Main orchestrator (Host/Join/Update logic)
│   └── remoteplayer.js    # Visual representation of other players (prediction/smoothing)
└── engine/systems/
    └── network.js         # Unified PeerJS wrapper (handles both Host and Client roles)
```

## Component Relationships

The Host acts as a central relay. Clients do not connect to each other directly; they all connect to the Host.

```mermaid
flowchart TB
    subgraph Host["Host Browser"]
        H_Main[main.js] -->|alwaysUpdate| H_Multi[Multiplayer]
        H_Multi --> H_Net[Network (host mode)]
        H_Multi --> H_Remote[RemotePlayers]
        H_Camera[Camera] -.->|position| H_Multi
    end
    
    subgraph Client["Client Browser"]
        C_Main[main.js] -->|alwaysUpdate| C_Multi[Multiplayer]
        C_Multi --> C_Net[Network (client mode)]
        C_Multi --> C_Remote[RemotePlayers]
        C_Camera[Camera] -.->|position| C_Multi
    end
    
    H_Net <-->|WebRTC via PeerJS| C_Net
```

## Data Flow: Position Synchronization

Since the game is **Client-Authoritative**, each player simulates their own physics locally and simply tells the Host "I am here". The Host collects these positions and broadcasts the full game state to everyone.

**Update Throttling:** To optimize bandwidth, position updates are throttled to 30 updates per second (configurable via `UPDATE_INTERVAL` in `multiplayer.js`), reducing network traffic by ~50% compared to per-frame updates.

1.  **Client Update** (throttled to 30 Hz):
    *   Reads local `Camera.position` and `Camera.rotation`.
    *   Sends `POS` message to Host: `{ pos: [x,y,z], rot: [pitch,yaw] }`.

2.  **Host Update** (throttled to 30 Hz):
    *   Receives `POS` messages from all clients and updates its `_peerPositions` map.
    *   Reads its own local `Camera` position.
    *   Compiles a `STATE` message containing all player locations.
    *   Broadcasts `STATE` to all connected clients.
    *   Updates its own visual `RemotePlayer` entities.

3.  **Client Receive**:
    *   Receives `STATE` message.
    *   Updates `RemotePlayer` entities (lerping positions for smoothness).

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Host
    
    loop Every Frame
        C->>H: POS { pos, rot }
        H->>H: Store in _peerPositions
        H->>C: STATE { players: [...] }
        C->>C: Update RemotePlayers
        H->>H: Update RemotePlayers
    end
```

## Extending for Gameplay (Deathmatch)

To support pickups, shooting, and scoring, the architecture can be extended using a **"Host as Referee"** model.

### 1. Pickups (The "Claim" System)
**Problem:** Two players touch a medkit at the same time.
**Solution:** Clients "claim" a pickup, Host confirms/denies.

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant H as Host
    
    P1->>P1: Touch Medkit #5
    P1->>H: CLAIM_PICKUP { id: 5 }
    H->>H: If active, mark taken
    H->>All: PICKUP_TAKEN { id: 5, by: P1 } 
```

### 2. Combat (The "Tattle" System)
**Problem:** Latency makes hitting moving targets inaccurate on the server.
**Solution:** Trust the shooter (Client-side hit detection).

```mermaid
sequenceDiagram
    participant Shooter
    participant Host
    participant Victim

    Shooter->>Shooter: Raycast hits Victim
    Shooter->>Host: EVENT_HIT { target: Victim, dmg: 20 }
    Host->>All: EVENT_DAMAGE { target: Victim, dmg: 20 }
    Victim->>Victim: Health -20
```

### 3. Game State
The Host maintains the official game state (Score, Time, Pickup Status) and broadcasts it inside the `STATE` packet.

```json
{
  "players": [ ... positions ... ],
  "game": {
    "timeLeft": 230,
    "scores": { "A": 5, "B": 2 },
    "pickups": [true, false, true, true] 
  }
}
```
