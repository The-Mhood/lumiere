import aiohttp
from aiohttp import web
from src.app.api_routes import init_app, register_routes

async def main():
    app = web.Application()
    await init_app(app)
    register_routes(app)
    
    # Run the app
    await web.run_app(app, host='0.0.0.0', port=8000)

if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
