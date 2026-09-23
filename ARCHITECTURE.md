# Sarva Architecture

This document describes the high-level architecture of the Sarva platform, incorporating the new ISL Integration, Dynamic Layouts, and the Dual-Service setup.

## System Overview

Sarva is composed of a **Node.js Web & WebSocket Orchestrator** and a **Python Flask STT Microservice**. This hybrid architecture allows robust, real-time WebSocket connections and data management in Node.js, while offloading the heavy audio processing and external AI transcription (Sarvam AI) calls to a dedicated Python worker.

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#1e1e2f,stroke:#4ade80,stroke-width:2px,color:#fff;
    classDef node fill:#1e1e2f,stroke:#818cf8,stroke-width:2px,color:#fff;
    classDef python fill:#1e1e2f,stroke:#fbbf24,stroke-width:2px,color:#fff;
    classDef external fill:#1e1e2f,stroke:#f87171,stroke-width:2px,color:#fff;
    classDef database fill:#1e1e2f,stroke:#e2e8f0,stroke-width:2px,color:#fff;

    subgraph Front-End Clients
        L[Landing Page]:::frontend
        T[Dashboard Client]:::frontend
        S[Student Client]:::frontend
        ISL[ISL Translator JS]:::frontend
    end

    subgraph Node.js Backend Server
        EXP[Express HTTP APIs]:::node
        WS[Socket.IO Server]:::node
        DB[(SQLite3 Database)]:::database
    end

    subgraph Python STT Microservice
        FL[Flask Audio Receiver]:::python
        WAV[Waveform/RMS Processor]:::python
    end

    subgraph External APIs
        SARVAM[Sarvam AI API]:::external
        GTRANS[Google Translate API]:::external
    end

    %% Routing
    L -- "POST /api/login" --> EXP
    T -- "MediaRecorder audio/webm chunks" --> EXP
    T -- "Controls layout/langs" --> WS
    WS -- "Syncs active layout/ISL state" --> S

    %% Audio Pipeline
    EXP -- "Forwards chunks (HTTP POST)" --> FL
    FL -- "Validates Silence/Volume" --> WAV
    WAV -- "Sends > 400 RMS audio" --> SARVAM
    SARVAM -- "Returns transcribed English/Hindi text" --> FL
    FL -- "Returns transcript to Node" --> EXP

    %% Translation Pipeline
    EXP -- "Translates raw transcript" --> GTRANS
    GTRANS -- "Returns multilingual text" --> EXP
    EXP -- "Broadcasts captions" --> WS

    %% Real-time Broadcast
    WS -- "Live Transcripts (N-langs)" --> T
    WS -- "Live Transcripts (N-langs)" --> S

    %% Database Operations
    EXP -- "Saves sessions & recordings" --> DB
    EXP -- "Saves notes" --> DB

    %% ISL Flow
    WS -- "Triggers caption event" --> ISL
    ISL -- "Word-to-Video Match" --> S
```

### Components Details

1. **Dashboard (formerly Teacher View)**: Controls the microphone, layout configuration (1-4 panels), dynamic languages, and the ISL toggle. Audio is recorded via `MediaRecorder` in `webm` chunks and posted to Node.js.
2. **Student View**: Connects silently via Socket.io. Listens for `layout-update`, `isl-visibility`, and `caption` events, adjusting its CSS Grid dynamically based on the dashboard's configuration.
3. **ISL Translator Module**: A frontend script (`isl-translator.js`) that maintains a queue of incoming transcribed English words. It resolves these words against an open-source ISL dictionary and sequentially streams gesture `.mp4` files into a dedicated WebGL/video panel.
4. **Python STT Service**: Receives raw audio chunks from Node.js, analyzes the Root Mean Square (RMS) volume to skip silent segments (saving API costs), and passes valid chunks to the **Sarvam AI** translation API.
5. **Database**: A `better-sqlite3` instance managing sessions, recordings, user accounts, and session notes using Write-Ahead Logging (WAL) for high concurrency.
