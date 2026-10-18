from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base, get_db
from .security import decode_token
from .websocket_manager import ws_manager

# Create tables if not existing
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Connectly FastAPI Backend"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_token(token)
    if not payload or "id" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload["id"]
    await ws_manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            event_payload = data.get("payload", {})

            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif event_type == "join_channel":
                target_id = event_payload.get("targetId")
                if target_id:
                    await ws_manager.join_channel(target_id, websocket)
            elif event_type == "leave_channel":
                target_id = event_payload.get("targetId")
                if target_id:
                    await ws_manager.leave_channel(target_id, websocket)
            elif event_type == "typing":
                target_id = event_payload.get("targetId")
                if target_id:
                    await ws_manager.broadcast_to_channel(
                        target_id,
                        {
                            "type": "typing_indicator",
                            "payload": {
                                "targetId": target_id,
                                "userId": user_id,
                                "isTyping": event_payload.get("isTyping", False),
                            }
                        },
                        exclude_ws=websocket
                    )
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
