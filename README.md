# DoodleDash

## Run standalone

The backend remains standalone when `REDIS_URL` is unset. Start it with `cd server && npm start` (port 3000), then start the client with `cd client && npm run dev`. Standalone client connections use `VITE_SERVER_URL` or `http://localhost:3000`.

## Run the room-affinity cluster

Start Redis 7:

```sh
docker run -p 6379:6379 redis:7
```

Install server dependencies with `cd server && npm install`, then start the gateway and three nodes with `npm run dev-cluster`. The gateway listens on 4000; nodes listen on 3001–3003. Configure the client with `VITE_GATEWAY_URL=http://localhost:4000 npm run dev` from `client/`. Redis stores only room ownership and node directory/load data; each owner keeps its game state, timers, and Socket.IO rooms in local memory.

For deployments behind a shared proxy, long-polling needs sticky sessions. Alternatively configure the client Socket.IO transport as `transports:["websocket"]`.

## Cluster check

With Redis available, run `cd server && npm run test:cluster`. The harness starts its own gateway and three nodes on ports 4000–4003, exercises room allocation/routing and game events, and kills one node to check directory liveness cleanup.
