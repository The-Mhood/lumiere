import asyncio
import aiohttp
from bs4 import BeautifulSoup
from typing import Optional, Dict

class CinejoyScraper:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.base_url = "https://cinejoy.pk"

    async def fetch_movie(self, query: str, page: int = 1) -> Optional[Dict]:
        """Searches Cinejoy.pk for a movie title."""
        url = f"{self.base_url}/search?q={query}&page={page}"
        try:
            async with self.session.get(url, timeout=15) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    results = soup.find_all('a', class_='title')
                    
                    for result in results:
                        movie_name = result.get_text(strip=True)
                        href = result.get('href')
                        
                        if href:
                            movie_id = href.split('/')[-1]
                            
                            # 2. Fetch Movie Details (The actual player)
                            detail_url = f"{self.base_url}/movie/{movie_id}"
                            async with self.session.get(detail_url, timeout=15) as detail_resp:
                                detail_html = await detail_resp.text()
                                detail_soup = BeautifulSoup(detail_html, 'html.parser')
                                
                                # Find the iframe or video container
                                player_container = detail_soup.find('div', class_='video-container')
                                
                                if player_container:
                                    iframe = player_container.find('iframe')
                                    if iframe:
                                        src = iframe.get('src')
                                        if src:
                                            # Clean up the src URL (remove base)
                                            clean_src = src.split('https://cinejoy.pk')[1] if 'https://cinejoy.pk' in src else src
                                            
                                            return {
                                                'name': movie_name,
                                                'src': clean_src,
                                                'id': movie_id,
                                                'thumbnail': detail_soup.find('img', class_='poster-image')['src'] if detail_soup.find('img', class_='poster-image') else None
                                            }
        except Exception as e:
            print(f"[Cinejoy] Error scraping: {e}")
        
        return None
