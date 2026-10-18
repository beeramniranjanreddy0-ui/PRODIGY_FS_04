import json
from typing import Dict, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # userId -> set of active WebSockets
        self.active_user_connections: Dict[str, Set[WebSocket]] = {}
        # channelId -> set of WebSockets
        self.channel_rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_user_connections:
            self.active_user_connections[user_id] = set()
        self.active_user_connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_user_connections:
            self.active_user_connections[user_id].discard(websocket)
            if not self.active_user_connections[user_id]:
                del self.active_user_connections[user_id]

        for channel in list(self.channel_rooms.keys()):
            self.channel_rooms[channel].discard(websocket)
            if not self.channel_rooms[channel]:
                del self.channel_rooms[channel]

    async def join_channel(self, channel_id: str, websocket: WebSocket):
        if channel_id not in self.channel_rooms:
            self.channel_rooms[channel_id] = set()
        self.channel_rooms[channel_id].add(websocket)

    async def leave_channel(self, channel_id: str, websocket: WebSocket):
        if channel_id in self.channel_rooms:
            self.channel_rooms[channel_id].discard(websocket)

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_user_connections:
            payload = json.dumps(message)
            for ws in list(self.active_user_connections[user_id]):
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def broadcast_to_channel(self, channel_id: str, message: dict, exclude_ws: WebSocket = None):
        if channel_id in self.channel_rooms:
            payload = json.dumps(message)
            for ws in list(self.channel_rooms[channel_id]):
                if ws == exclude_ws:
                    continue
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def broadcast_all(self, message: dict):
        payload = json.dumps(message)
        for user_sockets in self.active_user_connections.values():
            for ws in list(user_sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

ws_manager = ConnectionManager()
