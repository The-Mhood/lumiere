import bcrypt
import jwt
import time
from typing import Optional
from jose import JWTError

class JWTAuth:
    def __init__(self, secret: str, expiry: int = 3600):
        self.secret = secret
        self.expiry = expiry

    def create_token(self, user_id: str) -> str:
        payload = {
            'user_id': user_id,
            'exp': time.time() + self.expiry
        }
        return jwt.encode(payload, self.secret, algorithm='HS256')

    def verify_token(self, token: str) -> Optional[str]:
        try:
            payload = jwt.decode(token, self.secret, algorithms=['HS256'])
            return payload.get('user_id')
        except JWTError:
            return None

    def hash_password(self, password: str) -> bytes:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    def verify_password(self, hashed: bytes, password: str) -> bool:
        return bcrypt.checkpw(password.encode('utf-8'), hashed)
