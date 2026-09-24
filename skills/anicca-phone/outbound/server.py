#
# Copyright (c) 2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""server.py

Webhook server to handle outbound call requests, initiate calls via Twilio API,
and handle subsequent WebSocket connections for Media Streams.
"""

import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import HTMLResponse, JSONResponse
from loguru import logger
from call_context_store import CallContextStore
from phone_security import (
    dialout_key_is_valid,
    public_request_url,
    twilio_signature_is_valid,
)
from server_utils import (
    DialoutResponse,
    dialout_request_from_request,
    generate_twiml,
    make_twilio_call,
    parse_twiml_request,
)

load_dotenv(override=True)


app = FastAPI()
CALL_CONTEXTS = CallContextStore()


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True, "service": "rockstar_ibot-twilio-phone"})


@app.post("/dialout", response_model=DialoutResponse)
async def handle_dialout_request(request: Request) -> DialoutResponse:
    """Handle outbound call request and initiate call via Twilio.

    Args:
        request (Request): FastAPI request containing JSON with 'to_number' and 'from_number'.

    Returns:
        DialoutResponse: Response containing call_sid, status, and to_number.

    Raises:
        HTTPException: If request data is invalid or missing required fields.
    """
    expected_key = os.getenv("LM_PHONE_DIALOUT_SECRET", "") or os.getenv(
        "MR_BOT_PHONE_DIALOUT_SECRET", ""
    )
    provided_key = request.headers.get("x-rockstar_ibot-key", "") or request.headers.get(
        "x-mr-bot-key", ""
    )
    if not dialout_key_is_valid(expected_key, provided_key):
        raise HTTPException(status_code=401, detail="unauthorized")

    dialout_request = await dialout_request_from_request(request)
    context_id = CALL_CONTEXTS.put(
        mode=dialout_request.mode,
        ctx=dialout_request.ctx,
        name=dialout_request.name,
    )
    try:
        call_result = await make_twilio_call(dialout_request, context_id)
    except Exception:
        CALL_CONTEXTS.discard(context_id)
        raise

    return DialoutResponse(
        call_sid=call_result.call_sid,
        status="call_initiated",
        to_number=call_result.to_number,
    )


@app.post("/twiml")
async def get_twiml(request: Request) -> HTMLResponse:
    """Return TwiML instructions for connecting call to WebSocket.

    This endpoint is called by Twilio when a call is initiated. It returns TwiML
    that instructs Twilio to connect the call to our WebSocket endpoint with
    stream parameters containing call metadata.

    Args:
        request (Request): FastAPI request containing Twilio form data with 'To' and 'From'.

    Returns:
        HTMLResponse: TwiML XML response with Stream connection instructions.
    """
    form_data = await request.form()
    callback_url = public_request_url(
        os.getenv("LOCAL_SERVER_URL", ""), str(request.url)
    )
    if not twilio_signature_is_valid(
        auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
        signature=request.headers.get("x-twilio-signature", ""),
        url=callback_url,
        params=form_data,
    ):
        raise HTTPException(status_code=403, detail="invalid Twilio signature")

    twiml_request = await parse_twiml_request(request)

    twiml_content = generate_twiml(twiml_request)

    return HTMLResponse(content=twiml_content, media_type="application/xml")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connection from Twilio Media Streams.

    This endpoint receives the WebSocket connection from Twilio's Media Streams
    and runs the bot to handle the voice conversation. Stream parameters passed
    from TwiML are available to the bot for customization.

    Args:
        websocket (WebSocket): FastAPI WebSocket connection from Twilio.
    """
    callback_url = public_request_url(
        os.getenv("LOCAL_SERVER_URL", ""), str(websocket.url)
    )
    if not twilio_signature_is_valid(
        auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
        signature=websocket.headers.get("x-twilio-signature", ""),
        url=callback_url,
        params={},
    ):
        await websocket.close(code=1008)
        return

    from bot import bot
    from pipecat.runner.types import WebSocketRunnerArguments

    await websocket.accept()
    logger.info("WebSocket connection accepted for outbound call")

    try:
        runner_args = WebSocketRunnerArguments(websocket=websocket)
        await bot(runner_args, context_resolver=CALL_CONTEXTS.consume)
    except Exception as e:
        logger.error(f"Error in WebSocket endpoint: {e}")
        await websocket.close()


if __name__ == "__main__":
    # Run the server
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "7860"))
    logger.info(f"Starting Twilio outbound chatbot server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
