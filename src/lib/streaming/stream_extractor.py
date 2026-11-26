import yt_dlp
import aiohttp
from typing import Optional

class StreamPlayer:
    def __init__(self, ctx, session: aiohttp.ClientSession = None):
        self.ctx = ctx
        self.session = session or aiohttp.ClientSession()

    async def extract_stream(self, src: str, quality: str = "best", format: str = "best[height<={800}]") -> Optional[str]:
        """
        Uses yt-dlp to extract the actual .m3u8 or direct link.
        Handles HLS streams properly.
        """
        try:
            options = {
                'outtmpl': '%(id)s.%(ext)s',
                'format': format,
                'extract_flat': True,  # Extract just the URL
                'quiet': True,
                'no_warnings': True,
                'hls_preload_hls': True,  # Enable HLS stream preloading
                'hls_segment_template': '%(id)s.%(ext)s',  # For HLS segment concatenation
                'fragment': True,  # Extract fragments for HLS
                'merge_output_format': True,  # Merge segments into one file
                'writethumbnail': True,
                'timeout': 60,
                'retry_sleep_values': (1, 2, 4, 8, 16),
            }

            ydl = yt_dlp.YoutubeDL(options)
            info = ydl.extract_info(src, download_over_network=True)

            if info:
                stream_url = info['url']
                return stream_url

            return None

        except Exception as e:
            print(f"[Stream] Extraction error: {e}")
            
            # Fallback: Try direct extraction
            try:
                ydl_fallback = yt_dlp.YoutubeDL({'extract_flat': True, 'quiet': True, 'timeout': 60})
                info = ydl_fallback.extract_info(src, download_over_network=True)
                return info.get('url')
            except:
                pass
        
        return None

    async def close(self):
        await self.session.close()
