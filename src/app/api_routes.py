from aiohttp import web
from aiohttp.web_response import Response
from typing import List, Dict, Any

# Import your modules
from src.lib.aggregators.cinejoy_scraper import CinejoyScraper
from src.lib.streaming.stream_extractor import StreamPlayer
from src.lib.auth.jwt_auth import JWTAuth

# Global state (for simple demo)
_session_cache = {}

async def init_app(app: web.Application):
    # Initialize Auth
    app['auth'] = JWTAuth(secret="AUTH_SECRET")
    
    # Initialize Aggregator
    app['scraper'] = CinejoyScraper(session=None) # Will be bound to request context

async def register_routes(app: web.Application):
    # 1. Search Endpoint
    app.router.add_get('/api/search', search_titles)
    
    # 2. Auth Endpoint
    app.router.add_post('/api/auth/login', login_user)
    app.router.add_post('/api/auth/logout', logout_user)
    app.router.add_get('/api/auth/me', get_current_user)
    
    # 3. Stream Endpoint
    app.router.add_get('/api/stream', extract_stream)
    app.router.add_post('/api/stream/health', check_source_health)

async def search_titles(request: web.Request) -> Response:
    query = request.query.get('q', '')
    page = request.query.get('page', 1)
    
    # Create session for scraper
    session = aiohttp.ClientSession()
    scraper = CinejoyScraper(session)
    movie_data = await scraper.fetch_movie(query)
    await session.close()
    
    return web.json_response({'title': movie_data['name'] if movie_data else 'Not Found'})

async def extract_stream(request: web.Request) -> Response:
    src = request.query.get('src', '')
    
    # Create session for player
    session = aiohttp.ClientSession()
    player = StreamPlayer(ctx=None, session=session) # ctx not needed for pure extraction
    stream_url = await player.extract_stream(src)
    await player.close()
    
    return web.json_response({'url': stream_url})

async def login_user(request: web.Request) -> Response:
    data = await request.json()
    password = data.get('password')
    # In production, hash password and check DB
    hashed = JWTAuth(secret="AUTH_SECRET").hash_password(password)
    # Simulate user creation
    user_id = "user_123"
    token = JWTAuth(secret="AUTH_SECRET").create_token(user_id)
    return web.json_response({'token': token})

async def get_current_user(request: web.Request) -> Response:
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return web.json_response({'error': 'No token'}, status=401)
    
    token = auth_header.split(' ')[1]
    user_id = JWTAuth(secret="AUTH_SECRET").verify_token(token)
    
    if not user_id:
        return web.json_response({'error': 'Invalid token'}, status=401)
    
    return web.json_response({'user_id': user_id})

async def check_source_health(request: web.Request) -> Response:
    # Probes a source server-side and persists status
    src = request.query.get('src', '')
    # Simple health check
    session = aiohttp.ClientSession()
    try:
        async with session.get(src, timeout=5) as resp:
            return web.json_response({'status': 'online', 'url': src})
    except:
        return web.json_response({'status': 'offline', 'url': src})
